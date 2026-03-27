import { Transaction, DocumentRecord, Contact, VendorAlias } from '@/lib/types'

export interface MatchCandidate {
  transactionId: string
  score: number
  amountMatch: boolean
  vendorSimilarity: number
  dateProximityDays: number
}

// Scoring weights
const WEIGHT_AMOUNT = 0.5
const WEIGHT_VENDOR = 0.3
const WEIGHT_DATE = 0.2
const MAX_DATE_PROXIMITY_DAYS = 30

/**
 * Match a document against transactions using multi-factor scoring.
 * - Amount match (0.5): exact match within $0.01
 * - Vendor fuzzy match (0.3): simple string inclusion/similarity against description + contact name + patterns
 *   Now also uses vendor aliases learned from manual matches.
 * - Date proximity (0.2): linear decay over 30 days
 */
export function matchDocument(
  doc: DocumentRecord,
  transactions: Transaction[],
  contacts: Contact[],
  vendorAliases?: VendorAlias[]
): MatchCandidate[] {
  // Build a contact map
  const contactMap = new Map<string, Contact>()
  for (const c of contacts) contactMap.set(c.id, c)

  // Resolve vendor alias: if we've previously learned that this vendor maps to a contact, use it
  const aliasContactId = resolveVendorAlias(doc.extractedVendor, vendorAliases)

  const candidates: MatchCandidate[] = []

  for (const txn of transactions) {
    const amountScore = calculateAmountScore(doc.extractedAmount, txn.amount)
    const vendorSimilarity = calculateVendorSimilarity(doc.extractedVendor, txn, contactMap, aliasContactId)
    const dateResult = calculateDateProximity(doc.extractedDate, txn.date)

    const score = amountScore * WEIGHT_AMOUNT + vendorSimilarity * WEIGHT_VENDOR + dateResult.score * WEIGHT_DATE

    if (score > 0) {
      candidates.push({
        transactionId: txn.id,
        score: Math.round(score * 1000) / 1000,
        amountMatch: amountScore === 1,
        vendorSimilarity: Math.round(vendorSimilarity * 1000) / 1000,
        dateProximityDays: dateResult.days
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

function resolveVendorAlias(extractedVendor: string | null, aliases?: VendorAlias[]): string | null {
  if (!extractedVendor || !aliases || aliases.length === 0) return null
  const normalized = extractedVendor.toLowerCase().trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  const alias = aliases.find(a => a.extractedVendor === normalized)
  return alias?.contactId ?? null
}

function calculateAmountScore(extractedAmount: number | null, transactionAmount: number): number {
  if (extractedAmount === null) return 0
  const diff = Math.abs(Math.abs(extractedAmount) - Math.abs(transactionAmount))
  return diff <= 0.01 ? 1.0 : 0
}

function calculateVendorSimilarity(
  extractedVendor: string | null,
  txn: Transaction,
  contactMap: Map<string, Contact>,
  aliasContactId: string | null
): number {
  if (!extractedVendor) return 0
  const vendor = extractedVendor.toLowerCase().trim()
  if (!vendor) return 0

  // Learned alias match: if we previously learned that this vendor maps to a specific contact,
  // and this transaction belongs to that contact, it's a very strong signal
  if (aliasContactId && txn.contactId === aliasContactId) return 0.95

  const contact = txn.contactId ? contactMap.get(txn.contactId) : null
  const desc = txn.rawDescription.toLowerCase()
  const contactName = (contact?.name ?? '').toLowerCase()
  const patterns = contact?.transactionPatterns ?? []

  // Check for exact inclusion
  if (desc.includes(vendor) || vendor.includes(desc.split(/\s+/).slice(0, 3).join(' '))) return 1.0
  if (contactName && (contactName.includes(vendor) || vendor.includes(contactName))) return 0.9

  // Check patterns
  for (const p of patterns) {
    if (vendor.includes(p.toLowerCase()) || p.toLowerCase().includes(vendor)) return 0.8
  }

  // Token overlap (Jaccard-like)
  const vendorTokens = new Set(vendor.split(/[\s\-_.,]+/).filter(t => t.length > 1))
  const descTokens = new Set(desc.split(/[\s\-_.,]+/).filter(t => t.length > 1))
  const nameTokens = new Set(contactName.split(/[\s\-_.,]+/).filter(t => t.length > 1))
  const allTargetTokens = new Set([...descTokens, ...nameTokens])

  if (vendorTokens.size === 0 || allTargetTokens.size === 0) return 0

  let overlap = 0
  for (const t of vendorTokens) {
    for (const at of allTargetTokens) {
      if (t === at || t.includes(at) || at.includes(t)) { overlap++; break }
    }
  }

  return overlap / Math.max(vendorTokens.size, 1) * 0.7
}

function calculateDateProximity(extractedDate: string | null, transactionDate: string): { score: number; days: number } {
  if (!extractedDate) return { score: 0, days: -1 }
  const docDate = new Date(extractedDate)
  const txDate = new Date(transactionDate)
  if (isNaN(docDate.getTime()) || isNaN(txDate.getTime())) return { score: 0, days: -1 }
  const diffMs = Math.abs(docDate.getTime() - txDate.getTime())
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays > MAX_DATE_PROXIMITY_DAYS) return { score: 0, days: diffDays }
  return { score: 1 - diffDays / MAX_DATE_PROXIMITY_DAYS, days: diffDays }
}

export function isAutoMatch(candidates: MatchCandidate[]): boolean {
  if (candidates.length === 0) return false
  const best = candidates[0]
  if (best.score <= 0.7) return false
  if (candidates.length > 1 && candidates[1].score > 0.3) return false
  return true
}
