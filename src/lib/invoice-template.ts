import { createHash } from 'crypto'
import { DocumentRecord } from '@/lib/types'

export interface InvoiceTemplate {
  id: string
  contactId: string
  signature: TemplateSignature
  learnedFromDocId: string
  learnedAt: string
}

export interface TemplateSignature {
  vendorNormalized: string | null
  emailDomains: string[]
  vatTaxIds: string[]
  invoiceNumberPrefix: string | null
  lineItemTokens: string[]
  textHash: string
}

// Common English/Italian invoice noise tokens. Stripped before token extraction
// so signatures key on actual line-item terminology, not boilerplate.
const TOKEN_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'our', 'are',
  'was', 'were', 'has', 'have', 'had', 'will', 'shall', 'into', 'onto',
  'invoice', 'receipt', 'bill', 'billing', 'statement', 'order', 'page',
  'date', 'due', 'paid', 'total', 'subtotal', 'amount', 'amounts', 'tax',
  'taxes', 'vat', 'discount', 'qty', 'quantity', 'price', 'unit', 'item',
  'description', 'number', 'code', 'reference', 'ref', 'customer', 'client',
  'vendor', 'address', 'phone', 'email', 'period', 'thank', 'thanks', 'you',
  'please', 'pay', 'payment', 'payments', 'all', 'any', 'see', 'usd', 'eur',
  'gbp', 'inc', 'llc', 'ltd', 'corp', 'srl', 'spa',
])

export function normalizeVendor(s: string | null | undefined): string | null {
  if (!s) return null
  const v = s.toLowerCase().trim().replace(/\s+/g, ' ')
  return v || null
}

function stripDatesAndAmounts(text: string): string {
  return text
    // ISO dates
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    // US dates
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    // EU dates
    .replace(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, ' ')
    // Currency amounts ($1,234.56 / 1234.56)
    .replace(/\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}\b/g, ' ')
    .replace(/\b\d+\.\d{2}\b/g, ' ')
}

function emailDomains(emails: string[] | undefined): string[] {
  if (!emails || emails.length === 0) return []
  const set = new Set<string>()
  for (const e of emails) {
    const at = e.indexOf('@')
    if (at > 0 && at < e.length - 1) {
      set.add(e.slice(at + 1).toLowerCase().trim())
    }
  }
  return [...set].sort()
}

// Longest leading non-numeric prefix from an invoice number, e.g.
// "INV-F9E36132-001" -> "INV-F9E36132-". Pure numbers return null.
function invoicePrefix(invoiceNumber: string | null | undefined): string | null {
  if (!invoiceNumber) return null
  const trimmed = invoiceNumber.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^([^\d]+(?:[A-Z0-9]*[^0-9]+)*)/i)
  if (m && m[1] && m[1].length >= 2 && m[1].length < trimmed.length) return m[1]
  // No prefix that ends before the digits — fall back to non-numeric run only
  const nonNum = trimmed.match(/^[^\d]+/)
  return nonNum && nonNum[0].length >= 2 ? nonNum[0] : null
}

function topTokens(text: string, n: number): string[] {
  const stripped = stripDatesAndAmounts(text).toLowerCase()
  const counts = new Map<string, number>()
  // Split on non-alpha (allow accented chars), keep tokens of length >= 4
  const tokens = stripped.split(/[^a-zà-ÿ]+/).filter(t => t.length >= 4 && !TOKEN_STOPWORDS.has(t))
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
  // Stable: sort by count desc, then lex asc
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return ranked.slice(0, n).map(([t]) => t).sort()
}

function computeTextHash(text: string): string {
  const normalized = stripDatesAndAmounts(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500)
  return createHash('sha256').update(normalized).digest('hex')
}

export function computeSignature(doc: DocumentRecord): TemplateSignature {
  const ents = doc.extractedEntities
  return {
    vendorNormalized: normalizeVendor(doc.extractedVendor),
    emailDomains: emailDomains(ents?.emails),
    vatTaxIds: ents?.vatTaxIds ? [...ents.vatTaxIds].sort() : [],
    invoiceNumberPrefix: invoicePrefix(doc.extractedInvoiceNumber),
    lineItemTokens: topTokens(doc.extractedText || '', 6),
    textHash: computeTextHash(doc.extractedText || ''),
  }
}

// Weighted overlap. Each component contributes if both sides have data;
// missing-on-both is neutral (no penalty), missing-on-one is partial penalty.
const WEIGHTS = {
  vendor: 0.30,
  emailDomain: 0.20,
  vatId: 0.15,
  invoicePrefix: 0.20,
  textHash: 0.10,
  lineItemTokens: 0.05,
}

function setOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sa = new Set(a), sb = new Set(b)
  let common = 0
  for (const x of sa) if (sb.has(x)) common++
  return common / Math.min(sa.size, sb.size)
}

export function signatureMatch(a: TemplateSignature, b: TemplateSignature): number {
  let score = 0

  if (a.vendorNormalized && b.vendorNormalized) {
    if (a.vendorNormalized === b.vendorNormalized) score += WEIGHTS.vendor
    else if (a.vendorNormalized.includes(b.vendorNormalized) || b.vendorNormalized.includes(a.vendorNormalized)) {
      score += WEIGHTS.vendor * 0.6
    }
  }

  score += setOverlap(a.emailDomains, b.emailDomains) * WEIGHTS.emailDomain
  score += setOverlap(a.vatTaxIds, b.vatTaxIds) * WEIGHTS.vatId

  if (a.invoiceNumberPrefix && b.invoiceNumberPrefix) {
    if (a.invoiceNumberPrefix === b.invoiceNumberPrefix) score += WEIGHTS.invoicePrefix
    else if (a.invoiceNumberPrefix.startsWith(b.invoiceNumberPrefix) || b.invoiceNumberPrefix.startsWith(a.invoiceNumberPrefix)) {
      score += WEIGHTS.invoicePrefix * 0.5
    }
  }

  if (a.textHash && b.textHash && a.textHash === b.textHash) score += WEIGHTS.textHash

  score += setOverlap(a.lineItemTokens, b.lineItemTokens) * WEIGHTS.lineItemTokens

  return Math.min(1, score)
}

export const TEMPLATE_MATCH_THRESHOLD = 0.55

export function findMatchingTemplates(
  sig: TemplateSignature,
  templates: InvoiceTemplate[]
): { template: InvoiceTemplate; score: number }[] {
  const out: { template: InvoiceTemplate; score: number }[] = []
  for (const t of templates) {
    const score = signatureMatch(sig, t.signature)
    if (score >= TEMPLATE_MATCH_THRESHOLD) out.push({ template: t, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}
