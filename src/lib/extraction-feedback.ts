import { v4 as uuidv4 } from 'uuid'
import { DocumentRecord, Transaction } from '@/lib/types'
import { normalizeVendor } from '@/lib/invoice-template'

export type ExtractionField = 'amount' | 'date'

export interface VendorExtractionRule {
  id: string
  vendorNormalized: string
  field: ExtractionField
  label: string
  evidence: { docId: string; learnedAt: string }[]
}

// Labels we never accept as evidence — they tend to point at sub-totals,
// running balances, or unrelated columns rather than the actual posted amount/date.
const LABEL_DENY = new Set([
  'subtotal', 'sub-total', 'sub total', 'discount', 'refund', 'previous',
  'previous balance', 'balance forward', 'opening balance', 'last bill',
  'tax', 'vat', 'shipping', 'tip', 'gratuity', 'rounding',
])

// Labels we won't infer because they're already covered by built-in extractDate.
const COMMON_DATE_LABELS = new Set([
  'date', 'invoice date', 'bill date', 'issued', 'issue date',
])

export function isRuleActive(rule: VendorExtractionRule): boolean {
  return rule.evidence.length >= 2
}

// Format a numeric amount many ways so we can find it inside extractedText
// regardless of formatting style. Returns the literal strings to search for.
function amountVariants(amount: number): string[] {
  const abs = Math.abs(amount)
  const fixed = abs.toFixed(2)             // "1234.56"
  const [whole, frac] = fixed.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + frac
  const variants = new Set<string>([
    fixed,
    withCommas,
    `$${fixed}`,
    `$${withCommas}`,
    `$ ${fixed}`,
    `$ ${withCommas}`,
  ])
  return [...variants]
}

function dateVariants(iso: string): string[] {
  // Expect "YYYY-MM-DD". Produce ISO + US-slash variants.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return [iso]
  const [, y, mo, d] = m
  const moNum = parseInt(mo, 10), dNum = parseInt(d, 10)
  const variants = new Set<string>([
    iso,
    `${moNum}/${dNum}/${y}`,
    `${mo}/${d}/${y}`,
    `${moNum}/${dNum}/${y.slice(2)}`,
    `${dNum}/${moNum}/${y}`,    // EU
    `${d}/${mo}/${y}`,
  ])
  return [...variants]
}

// Walk back ~maxChars from the value, find the nearest preceding label —
// the last word/short phrase on the same line (or one above) that isn't itself
// a date or number.
export function extractLabelBefore(text: string, valueIndex: number, maxChars: number): string | null {
  if (valueIndex <= 0) return null
  const start = Math.max(0, valueIndex - maxChars)
  const window = text.slice(start, valueIndex)

  // Strip the trailing punctuation/whitespace/colons that sit between the label and the value.
  const trimmed = window.replace(/[\s:$,\-=>]+$/g, '')
  if (!trimmed) return null

  // Last newline in the window — labels rarely span lines.
  const lastNl = trimmed.lastIndexOf('\n')
  const segment = (lastNl >= 0 ? trimmed.slice(lastNl + 1) : trimmed).trim()
  if (!segment) return null

  // Pull a 1-3 word label off the END (label sits right before the value).
  const tokens = segment.split(/\s+/).filter(Boolean)
  // Drop tokens that are themselves numeric / currency-ish.
  const cleaned: string[] = []
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (/^[\d.,$\-:/\\]+$/.test(t)) break
    cleaned.unshift(t)
    if (cleaned.length >= 3) break
  }
  if (cleaned.length === 0) return null
  // Strip trailing punctuation from each token.
  const label = cleaned.map(t => t.replace(/[:,;.()\[\]{}]+$/g, '').replace(/^[:,;.()\[\]{}]+/g, '')).filter(Boolean).join(' ').trim()
  if (!label) return null
  if (label.length > 40) return null
  // Reject pure-symbol or 1-char labels.
  if (!/[a-zA-Z]{2,}/.test(label)) return null
  // Reject deny-list labels.
  if (LABEL_DENY.has(label.toLowerCase())) return null
  return label
}

// Build candidate rules whenever extracted ≠ actual. Each rule needs ≥2 evidence
// from different docs to activate; the store dedupes evidence by docId.
export function inferRulesFromMatch(doc: DocumentRecord, txn: Transaction): VendorExtractionRule[] {
  const vendor = normalizeVendor(doc.extractedVendor)
  if (!vendor) return []
  const text = doc.extractedText || ''
  const out: VendorExtractionRule[] = []
  const learnedAt = new Date().toISOString()

  // ---- Amount feedback ----
  const txnAmt = Math.abs(txn.amount)
  const docAmt = doc.extractedAmount === null ? null : Math.abs(doc.extractedAmount)
  if (txnAmt > 0 && (docAmt === null || Math.abs(docAmt - txnAmt) > 0.01)) {
    for (const v of amountVariants(txnAmt)) {
      const idx = text.indexOf(v)
      if (idx === -1) continue
      const label = extractLabelBefore(text, idx, 30)
      if (!label) continue
      out.push({
        id: uuidv4(),
        vendorNormalized: vendor,
        field: 'amount',
        label,
        evidence: [{ docId: doc.id, learnedAt }],
      })
      break  // one label per field per doc is plenty
    }
  }

  // ---- Date feedback ----
  if (txn.date && doc.extractedDate !== txn.date) {
    for (const v of dateVariants(txn.date)) {
      const idx = text.indexOf(v)
      if (idx === -1) continue
      const label = extractLabelBefore(text, idx, 30)
      if (!label) continue
      // Suppress redundant labels — these are already handled by built-in extractDate.
      if (COMMON_DATE_LABELS.has(label.toLowerCase())) continue
      out.push({
        id: uuidv4(),
        vendorNormalized: vendor,
        field: 'date',
        label,
        evidence: [{ docId: doc.id, learnedAt }],
      })
      break
    }
  }

  return out
}

// Merge a freshly inferred rule into an existing list. Rules sharing the same
// (vendor, field, label) accumulate evidence (deduped by docId). Returns the
// merged list — does not mutate input.
export function mergeRule(existing: VendorExtractionRule[], incoming: VendorExtractionRule): VendorExtractionRule[] {
  const idx = existing.findIndex(r =>
    r.vendorNormalized === incoming.vendorNormalized &&
    r.field === incoming.field &&
    r.label.toLowerCase() === incoming.label.toLowerCase()
  )
  if (idx === -1) return [...existing, incoming]

  const target = existing[idx]
  const haveDocs = new Set(target.evidence.map(e => e.docId))
  const additions = incoming.evidence.filter(e => !haveDocs.has(e.docId))
  if (additions.length === 0) return existing

  const merged: VendorExtractionRule = {
    ...target,
    evidence: [...target.evidence, ...additions],
  }
  const next = existing.slice()
  next[idx] = merged
  return next
}
