import { Category, Contact, CategorizationRule, AppSettings } from './types'

// ============ DEFAULT CATEGORIES ============
export const DEFAULT_CATEGORIES: Category[] = [
  // Income
  { id: 'cat-001', name: 'Income', color: '#10B981', parentId: null, isDefault: true },
  { id: 'cat-002', name: 'Desk Rental', color: '#34D399', parentId: 'cat-001', isDefault: true },
  { id: 'cat-003', name: 'Consulting', color: '#6EE7B7', parentId: 'cat-001', isDefault: true },
  { id: 'cat-004', name: 'Other Income', color: '#A7F3D0', parentId: 'cat-001', isDefault: true },
  // Expenses
  { id: 'cat-010', name: 'Expenses', color: '#EF4444', parentId: null, isDefault: true },
  { id: 'cat-011', name: 'Software & Subscriptions', color: '#8B5CF6', parentId: 'cat-010', isDefault: true },
  { id: 'cat-012', name: 'Insurance', color: '#F59E0B', parentId: 'cat-010', isDefault: true },
  { id: 'cat-013', name: 'Utilities', color: '#F97316', parentId: 'cat-010', isDefault: true },
  { id: 'cat-014', name: 'Internet & Phone', color: '#EC4899', parentId: 'cat-010', isDefault: true },
  { id: 'cat-015', name: 'Office Supplies', color: '#14B8A6', parentId: 'cat-010', isDefault: true },
  { id: 'cat-016', name: 'Payroll & HR', color: '#6366F1', parentId: 'cat-010', isDefault: true },
  { id: 'cat-017', name: 'Professional Services', color: '#0EA5E9', parentId: 'cat-010', isDefault: true },
  { id: 'cat-018', name: 'Transportation', color: '#A855F7', parentId: 'cat-010', isDefault: true },
  { id: 'cat-019', name: 'Food & Catering', color: '#F43F5E', parentId: 'cat-010', isDefault: true },
  { id: 'cat-020', name: 'Marketing', color: '#84CC16', parentId: 'cat-010', isDefault: true },
  { id: 'cat-021', name: 'Rent', color: '#78716C', parentId: 'cat-010', isDefault: true },
  { id: 'cat-022', name: 'Healthcare', color: '#DC2626', parentId: 'cat-010', isDefault: true },
  { id: 'cat-023', name: 'Other Expenses', color: '#9CA3AF', parentId: 'cat-010', isDefault: true },
  // Transfers & Payroll
  { id: 'cat-030', name: 'Transfers', color: '#64748B', parentId: null, isDefault: true },
  { id: 'cat-031', name: 'Payroll', color: '#475569', parentId: null, isDefault: true },
]

// ============ SEED CONTACTS ============
const now = new Date().toISOString()

export const SEED_CONTACTS: Contact[] = [
  { id: 'con-001', name: 'Marco Rosella', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['MARCO RO'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-002', name: 'Silvia Garuti', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['SILVIA G'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-003', name: 'Nakworks', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['NAKWORKS'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-004', name: 'Francesco Emiliano Ponzi', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['PONZI', 'FRANCESCO'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-005', name: 'Giulia Zoavo', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['ZOAVO', 'GIULIA'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-006', name: 'Vittorio Perotti', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['PEROTTI', 'VITTORIO'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-007', name: 'John Frattasi', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['FRATTASI'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-008', name: 'Lorenzo Fanton / Laguna Design', legalEntityName: 'Laguna Design', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['FANTON', 'LAGUNA'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-009', name: 'Gabriel Zangari / Officina 27', legalEntityName: 'Officina 27', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['ZANGARI', 'OFFICINA'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-010', name: 'Dario Spinelli', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['SPINELLI'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-011', name: 'Irene Maria Bissoli', legalEntityName: '', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'Desk renter', transactionPatterns: ['BISSOLI'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-020', name: 'Canva', legalEntityName: 'Canva Pty Ltd', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Design software', transactionPatterns: ['CANVA'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-021', name: 'United Healthcare', legalEntityName: 'United Healthcare', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Health insurance', transactionPatterns: ['UNITED HEALTHCARE'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-022', name: 'ADP', legalEntityName: 'ADP, LLC', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Payroll & HR services', transactionPatterns: ['ADP'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-023', name: 'Spectrum', legalEntityName: 'Charter Communications', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Internet service', transactionPatterns: ['SPECTRUM'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-024', name: 'Con Edison', legalEntityName: 'Consolidated Edison, Inc.', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Electricity', transactionPatterns: ['CON ED'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-025', name: 'T-Mobile', legalEntityName: 'T-Mobile USA, Inc.', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Phone plan', transactionPatterns: ['TMOBILE', 'T-MOBILE'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-026', name: 'Hiscox', legalEntityName: 'Hiscox Inc.', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Business insurance', transactionPatterns: ['HISCOX'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-027', name: 'Eventbrite', legalEntityName: 'Eventbrite, Inc.', type: 'vendor', vatTaxId: '', address: '95 Third Street, San Francisco, CA 94103', email: 'invoicesupport@eventbrite.com', phone: '', notes: 'Events platform', transactionPatterns: ['EVENTBRITE'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-028', name: 'Mailchimp', legalEntityName: 'The Rocket Science Group, LLC', type: 'vendor', vatTaxId: 'US EIN 58-2554149', address: '405 N. Angier Ave. NE, Atlanta, GA 30308', email: '', phone: '', notes: 'Email marketing', transactionPatterns: ['MAILCHIMP'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-029', name: 'OpenAI', legalEntityName: 'OpenAI, Inc.', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'AI subscription', transactionPatterns: ['OPENAI'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-030', name: 'Anthropic / Claude AI', legalEntityName: 'Anthropic, PBC', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'AI subscription', transactionPatterns: ['CLAUDE.AI', 'ANTHROPIC'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-031', name: 'Nespresso', legalEntityName: 'Nespresso USA, Inc.', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Coffee supplies', transactionPatterns: ['NESPRESSO'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-032', name: 'Lyft', legalEntityName: 'Lyft, Inc.', type: 'vendor', vatTaxId: '', address: '548 Market St, San Francisco, CA 94104', email: '', phone: '', notes: 'Transportation', transactionPatterns: ['LYFT'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-033', name: 'Comcast', legalEntityName: 'Comcast Cable Communications', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Internet/Cable', transactionPatterns: ['COMCK', 'COMCAST'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-034', name: 'Ricci Consulting', legalEntityName: 'Ricci Consulting', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Consulting services', transactionPatterns: ['RICCI CONSULTING'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-035', name: 'Jim Trust', legalEntityName: '', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Office rent', transactionPatterns: ['JIM TRUST'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-036', name: 'Amazon', legalEntityName: 'Amazon.com, Inc.', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: 'Office supplies', transactionPatterns: ['AMAZON'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-037', name: 'Accurat NYC', legalEntityName: 'Accurat USA Inc.', type: 'client', vatTaxId: '', address: '', email: '', phone: '', notes: 'www.accurat.nyc payments', transactionPatterns: ['www.accurat.nyc'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-038', name: 'Google', legalEntityName: 'Google LLC', type: 'vendor', vatTaxId: '', address: '', email: '', phone: '', notes: '', transactionPatterns: ['GOOGLE'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-040', name: 'Kirti Randmaa', legalEntityName: '', type: 'service', vatTaxId: '', address: '', email: '', phone: '', notes: 'Cleaning service', transactionPatterns: ['KIRTI'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-041', name: 'Ciaovino', legalEntityName: 'Ciaovino', type: 'service', vatTaxId: '', address: '', email: '', phone: '', notes: 'Catering service', transactionPatterns: ['CIAOVINO'], source: 'manual', createdAt: now, updatedAt: now },
  { id: 'con-042', name: 'Beatrice', legalEntityName: '', type: 'service', vatTaxId: '', address: '', email: '', phone: '', notes: '', transactionPatterns: ['BEATRICE'], source: 'manual', createdAt: now, updatedAt: now },
]

// ============ SEED RULES ============
export function generateSeedRules(contacts: Contact[], categories: Category[]): CategorizationRule[] {
  const rules: CategorizationRule[] = []
  let priority = 1

  const contactCategoryMap: Record<string, string> = {
    'con-001': 'cat-002', 'con-002': 'cat-002', 'con-003': 'cat-002',
    'con-004': 'cat-002', 'con-005': 'cat-002', 'con-006': 'cat-002',
    'con-007': 'cat-002', 'con-008': 'cat-002', 'con-009': 'cat-002',
    'con-010': 'cat-002', 'con-011': 'cat-002',
    'con-020': 'cat-011', 'con-021': 'cat-022', 'con-022': 'cat-016',
    'con-023': 'cat-014', 'con-024': 'cat-013', 'con-025': 'cat-014',
    'con-026': 'cat-012', 'con-027': 'cat-020', 'con-028': 'cat-020',
    'con-029': 'cat-011', 'con-030': 'cat-011', 'con-031': 'cat-015',
    'con-032': 'cat-018', 'con-033': 'cat-014', 'con-034': 'cat-017',
    'con-035': 'cat-021', 'con-036': 'cat-015', 'con-037': 'cat-004',
    'con-038': 'cat-023', 'con-040': 'cat-017', 'con-041': 'cat-019',
    'con-042': 'cat-023',
  }

  for (const contact of contacts) {
    const categoryId = contactCategoryMap[contact.id] || 'cat-023'
    for (const pattern of contact.transactionPatterns) {
      rules.push({
        id: `rule-${String(priority).padStart(3, '0')}`,
        name: `${contact.name} (${pattern})`,
        priority,
        matchType: 'contains',
        pattern,
        caseSensitive: false,
        categoryId,
        contactId: contact.id,
        enabled: true,
        appliedCount: 0,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      })
      priority++
    }
  }

  return rules
}

// ============ DEFAULT SETTINGS ============
export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  defaultBank: 'chase',
  csvDateFormat: 'MM-DD-YYYY',
  theme: 'light',
  defaultSort: { field: 'date', direction: 'desc' },
  dateProximityDays: 30,
  businessName: 'Accurat USA Inc.',
  businessTaxId: '',
  customAmountLabels: [
    'Total cash required for Citibank, Routing/Transit no. (ABA) 021000089, Bank account no. XXXXXX2801',
    'Total Due by Auto Pay',
    'Total Debited',
    'Amount Due',
    'Total Due'
  ],
  contractPatterns: []
}
