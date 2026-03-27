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
 * - Vendor fuzzy match (0.3): uses extractedVendor, extracted entities (business/person names),
 *   vendor aliases learned from manual matches, contact names, and transaction patterns
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

  // Collect all entity names from the document for broader matching
  const entityNames = collectEntityNames(doc)

  const candidates: MatchCandidate[] = []

  for (const txn of transactions) {
    const amountScore = calculateAmountScore(doc.extractedAmount, txn.amount)
    const vendorSimilarity = calculateVendorSimilarity(doc.extractedVendor, txn, contactMap, aliasContactId, entityNames)
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

/**
 * Collect all names from extracted entities for matching.
 * Returns lowercased names from businessNames and personNames.
 */
function collectEntityNames(doc: DocumentRecord): string[] {
  const names: string[] = []
  if (doc.extractedEntities) {
    for (const name of doc.extractedEntities.businessNames) {
      names.push(name.toLowerCase().trim())
    }
    for (const name of doc.extractedEntities.personNames) {
      names.push(name.toLowerCase().trim())
    }
  }
  return names
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
  aliasContactId: string | null,
  entityNames: string[]
): number {
  const vendor = extractedVendor?.toLowerCase().trim() || ''
  const contact = txn.contactId ? contactMap.get(txn.contactId) : null
  const desc = txn.rawDescription.toLowerCase()
  const contactName = (contact?.name ?? '').toLowerCase()
  const legalName = (contact?.legalEntityName ?? '').toLowerCase()
  const patterns = contact?.transactionPatterns ?? []

  // 1. Learned alias match: previously matched this vendor → this contact
  if (aliasContactId && txn.contactId === aliasContactId) return 0.95

  // 2. Check extractedVendor against description and contact
  if (vendor) {
    if (desc.includes(vendor) || vendor.includes(desc.split(/\s+/).slice(0, 3).join(' '))) return 1.0
    if (contactName && (contactName.includes(vendor) || vendor.includes(contactName))) return 0.9
    if (legalName && (legalName.includes(vendor) || vendor.includes(legalName))) return 0.9
    for (const p of patterns) {
      if (vendor.includes(p.toLowerCase()) || p.toLowerCase().includes(vendor)) return 0.8
    }
  }

  // 3. Check extracted entity names (business names, person names) against transaction & contact
  //    This is the key enhancement — PDF-extracted entities used for matching
  if (entityNames.length > 0) {
    let bestEntityScore = 0
    for (const entityName of entityNames) {
      // Entity name found in transaction description
      if (desc.includes(entityName) || entityName.includes(desc.split(/\s+/).slice(0, 3).join(' '))) {
        bestEntityScore = Math.max(bestEntityScore, 0.9)
      }
      // Entity name matches contact name
      if (contactName && (contactName.includes(entityName) || entityName.includes(contactName))) {
        bestEntityScore = Math.max(bestEntityScore, 0.85)
      }
      // Entity name matches legal entity name
      if (legalName && (legalName.includes(entityName) || entityName.includes(legalName))) {
        bestEntityScore = Math.max(bestEntityScore, 0.85)
      }
      // Entity name matches transaction patterns
      for (const p of patterns) {
        if (entityName.includes(p.toLowerCase()) || p.toLowerCase().includes(entityName)) {
          bestEntityScore = Math.max(bestEntityScore, 0.75)
        }
      }
      // Token overlap between entity name and description+contact
      if (bestEntityScore === 0) {
        const entityTokens = new Set(entityName.split(/[\s\-_.,]+/).filter(t => t.length > 1))
        const descTokens = new Set(desc.split(/[\s\-_.,]+/).filter(t => t.length > 1))
        const nameTokens = new Set(contactName.split(/[\s\-_.,]+/).filter(t => t.length > 1))
        const allTargetTokens = new Set([...descTokens, ...nameTokens])
        if (entityTokens.size > 0 && allTargetTokens.size > 0) {
          let overlap = 0
          for (const t of entityTokens) {
            for (const at of allTargetTokens) {
              if (t === at || (t.length > 2 && at.length > 2 && (t.includes(at) || at.includes(t)))) { overlap++; break }
            }
          }
          const tokenScore = overlap / Math.max(entityTokens.size, 1) * 0.65
          bestEntityScore = Math.max(bestEntityScore, tokenScore)
        }
      }
    }
    if (bestEntityScore > 0) return bestEntityScore
  }

  // 4. Token overlap between extractedVendor and description+contact (original fallback)
  if (!vendor) return 0
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

/**
 * After a document is matched to a transaction (auto or manual),
 * update the contact with extracted entities (address, email, phone, VAT).
 * Only fills in empty fields — never overwrites existing data.
 */
export function updateContactFromEntities(
  doc: DocumentRecord,
  contactId: string,
  contacts: Contact[],
  updateContact: (id: string, updates: Partial<Contact>) => void
) {
  if (!doc.extractedEntities) return
  const contact = contacts.find(c => c.id === contactId)
  if (!contact) return

  const updates: Partial<Contact> = {}
  const entities = doc.extractedEntities

  // Fill address if empty
  if (!contact.address && entities.addresses.length > 0) {
    updates.address = entities.addresses[0]
  }

  // Fill email if empty
  if (!contact.email && entities.emails.length > 0) {
    updates.email = entities.emails[0]
  }

  // Fill phone if empty
  if (!contact.phone && entities.phones.length > 0) {
    updates.phone = entities.phones[0]
  }

  // Fill VAT/tax ID if empty
  if (!contact.vatTaxId && entities.vatTaxIds.length > 0) {
    updates.vatTaxId = entities.vatTaxIds[0]
  }

  // Fill legal entity name if empty and we have a business name different from contact name
  if (!contact.legalEntityName && entities.businessNames.length > 0) {
    const bizName = entities.businessNames[0]
    if (bizName.toLowerCase() !== contact.name.toLowerCase()) {
      updates.legalEntityName = bizName
    }
  }

  if (Object.keys(updates).length > 0) {
    updateContact(contactId, updates)
  }
}
