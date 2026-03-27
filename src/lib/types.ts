// Transaction
export interface Transaction {
  id: string
  hash: string
  date: string // ISO "2026-03-09"
  rawDescription: string
  amount: number // positive = credit/income, negative = debit/expense
  type: 'debit' | 'credit'
  contactId: string | null
  categoryId: string | null
  billingPeriod: { month: number; year: number } | null
  billingPeriodOverride: boolean
  status: 'unreconciled' | 'reconciled' | 'flagged' | 'contract'
  documentIds: string[]
  splitParts: SplitPart[] | null
  notes: string
  ruleIdApplied: string | null
  importedAt: string
  updatedAt: string
}

export interface SplitPart {
  id: string
  amount: number
  categoryId: string | null
  contactId: string | null
  documentId: string | null
  notes: string
}

// Contact
export interface Contact {
  id: string
  name: string
  legalEntityName: string
  type: 'vendor' | 'client' | 'service'
  vatTaxId: string
  address: string
  email: string
  phone: string
  notes: string
  transactionPatterns: string[]
  source: 'manual' | 'auto-detected' | 'invoice-extracted'
  createdAt: string
  updatedAt: string
}

// Category
export interface Category {
  id: string
  name: string
  color: string
  parentId: string | null
  isDefault: boolean
}

// Categorization Rule
export interface CategorizationRule {
  id: string
  name: string
  priority: number
  matchType: 'exact' | 'contains' | 'regex'
  pattern: string
  caseSensitive: boolean
  categoryId: string
  contactId: string | null
  enabled: boolean
  appliedCount: number
  source: 'manual' | 'suggested'
  createdAt: string
  updatedAt: string
}

// Extracted entities from PDF scanning
export interface ExtractedEntities {
  businessNames: string[]
  personNames: string[]
  addresses: string[]
  emails: string[]
  phones: string[]
  vatTaxIds: string[]
}

// Document Record
export interface DocumentRecord {
  id: string
  originalFilename: string
  storedPath: string
  extractedText: string
  extractedDate: string | null
  extractedAmount: number | null
  extractedVendor: string | null
  extractedInvoiceNumber: string | null
  extractedBillingPeriod: { month: number; year: number } | null
  extractedEntities?: ExtractedEntities
  direction: 'incoming' | 'outgoing'
  matchedTransactionIds: string[]
  matchConfidence: number
  matchMethod: 'auto' | 'manual'
  scannedAt: string
}

// Vendor Alias
export interface VendorAlias {
  extractedVendor: string
  contactId: string
  learnedAt: string
}

// App Settings
export interface AppSettings {
  version: number
  defaultBank: 'chase'
  csvDateFormat: string
  theme: 'light' | 'dark' | 'system'
  defaultSort: { field: string; direction: 'asc' | 'desc' }
  dateProximityDays: number
  businessName: string
  businessTaxId: string
  customAmountLabels: string[]
  contractPatterns: string[]
}

// CSV parsing result
export interface ParsedTransaction {
  date: string
  rawDescription: string
  amount: number
  type: 'debit' | 'credit'
  hash: string
}

export interface ImportResult {
  newCount: number
  skippedCount: number
  newTransactions: Transaction[]
}

// Document scanning result
export interface ExtractedData {
  text: string
  date: string | null
  amount: number | null
  vendor: string | null
  invoiceNumber: string | null
  billingPeriod: { month: number; year: number } | null
}

export interface MatchCandidate {
  transactionId: string
  score: number
  amountMatch: boolean
  vendorSimilarity: number
  dateProximityDays: number
}
