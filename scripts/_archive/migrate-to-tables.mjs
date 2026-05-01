#!/usr/bin/env node
/**
 * One-shot — Phase 4: copy every row from the legacy `app_data` JSONB blob
 * into the new relational tables created by
 * `supabase/migrations/001_relational_schema.sql`.
 *
 * Order matters because of FKs:
 *   categories → contacts → transactions
 *   contacts   → vendor_aliases / invoice_templates / categorization_rules
 *   documents → document_transactions (junction)
 *
 * Idempotent: every INSERT uses ON CONFLICT DO NOTHING / ON CONFLICT DO
 * UPDATE so re-running is a no-op once data is in.
 *
 *   node scripts/_archive/migrate-to-tables.mjs            # dry-run counts
 *   node scripts/_archive/migrate-to-tables.mjs --write    # apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const WRITE = process.argv.includes('--write')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Helper: read a value blob and return its inner array (handles legacy and
// new JSONB key names from Phase 0).
async function readBlobArray(key, ...candidateFields) {
  const { data } = await supabase.from('app_data').select('value').eq('key', key).single()
  for (const f of candidateFields) {
    if (Array.isArray(data?.value?.[f])) return data.value[f]
  }
  return []
}

const cats         = await readBlobArray('categories', 'categories')
const contacts     = await readBlobArray('contacts', 'contacts')
const txns         = await readBlobArray('transactions', 'transactions')
const docs         = await readBlobArray('documents', 'documents')
const rules        = await readBlobArray('rules', 'rules')
const vendorAliases= await readBlobArray('vendorAliases', 'vendorAliases', 'aliases')
const tmpls        = await readBlobArray('invoiceTemplates', 'invoiceTemplates', 'templates')
const exrules      = await readBlobArray('vendorExtractionRules', 'vendorExtractionRules', 'rules')
const settingsRow  = await supabase.from('app_data').select('value').eq('key', 'settings').single()
const settings     = settingsRow.data?.value ?? {}

console.log(`Source data:`)
console.log(`  categories:                ${cats.length}`)
console.log(`  contacts:                  ${contacts.length}`)
console.log(`  transactions:              ${txns.length}`)
console.log(`  documents:                 ${docs.length}`)
console.log(`  categorization rules:      ${rules.length}`)
console.log(`  vendor aliases:            ${vendorAliases.length}`)
console.log(`  invoice templates:         ${tmpls.length}`)
console.log(`  vendor extraction rules:   ${exrules.length}`)
console.log(`  settings:                  ${Object.keys(settings).length} keys`)
console.log()

if (!WRITE) {
  console.log('DRY RUN — pass --write to apply.')
  process.exit(0)
}

// upsertChunked — Supabase has a per-call payload limit; chunk to 500.
async function upsertChunked(table, rows, opts = {}) {
  const SIZE = 500
  for (let i = 0; i < rows.length; i += SIZE) {
    const chunk = rows.slice(i, i + SIZE)
    const { error } = await supabase.from(table).upsert(chunk, opts)
    if (error) {
      console.error(`upsert ${table} (chunk ${i}-${i + chunk.length}) failed:`, error)
      process.exit(1)
    }
  }
  console.log(`  ${table}: ${rows.length} rows`)
}

// ---- 1. categories (parent FK: insert in two passes — roots first) ----
const rootCats  = cats.filter(c => !c.parentId)
const childCats = cats.filter(c =>  c.parentId)
await upsertChunked('categories', rootCats.map(c => ({
  id: c.id, name: c.name, color: c.color, parent_id: null, is_default: !!c.isDefault,
})), { onConflict: 'id' })
await upsertChunked('categories', childCats.map(c => ({
  id: c.id, name: c.name, color: c.color, parent_id: c.parentId, is_default: !!c.isDefault,
})), { onConflict: 'id' })

// Build the FK validity sets up-front so later inserts can null orphans.

// ---- 2. contacts ----
await upsertChunked('contacts', contacts.map(c => ({
  id: c.id, name: c.name, legal_entity_name: c.legalEntityName ?? '',
  type: c.type ?? 'vendor', vat_tax_id: c.vatTaxId ?? '',
  address: c.address ?? '', email: c.email ?? '', phone: c.phone ?? '',
  notes: c.notes ?? '',
  transaction_patterns: Array.isArray(c.transactionPatterns) ? c.transactionPatterns : [],
  source: c.source ?? 'manual',
  created_at: c.createdAt ?? new Date().toISOString(),
  updated_at: c.updatedAt ?? new Date().toISOString(),
})), { onConflict: 'id' })

// ---- 3. transactions ----
const txnContactIdSet  = new Set(contacts.map(c => c.id))
const txnCategoryIdSet = new Set(cats.map(c => c.id))
await upsertChunked('transactions', txns.map(t => ({
  id: t.id, hash: t.hash, date: t.date,
  raw_description: t.rawDescription ?? '',
  amount: t.amount,
  type: t.type ?? (t.amount >= 0 ? 'credit' : 'debit'),
  contact_id:  t.contactId  && txnContactIdSet.has(t.contactId)   ? t.contactId  : null,
  category_id: t.categoryId && txnCategoryIdSet.has(t.categoryId) ? t.categoryId : null,
  billing_period_year: t.billingPeriod?.year ?? null,
  billing_period_month: t.billingPeriod?.month ?? null,
  billing_period_override: !!t.billingPeriodOverride,
  status: t.status ?? 'unreconciled',
  split_parts: t.splitParts ?? null,
  notes: t.notes ?? '',
  rule_id_applied: t.ruleIdApplied ?? null,
  imported_at: t.importedAt ?? new Date().toISOString(),
  updated_at: t.updatedAt ?? new Date().toISOString(),
})), { onConflict: 'id' })

// ---- 4. documents ----
await upsertChunked('documents', docs.map(d => ({
  id: d.id,
  original_filename: d.originalFilename,
  stored_path: d.storedPath,
  thumbnail_path: d.thumbnailPath ?? null,
  historical_paths: Array.isArray(d.historicalPaths) ? d.historicalPaths : [],
  extracted_text: d.extractedText ?? '',
  extracted_date: d.extractedDate ?? null,
  extracted_amount: d.extractedAmount ?? null,
  extracted_vendor: d.extractedVendor ?? null,
  extracted_invoice_number: d.extractedInvoiceNumber ?? null,
  extracted_billing_year: d.extractedBillingPeriod?.year ?? null,
  extracted_billing_month: d.extractedBillingPeriod?.month ?? null,
  extracted_entities: d.extractedEntities ?? null,
  direction: d.direction ?? 'incoming',
  match_confidence: d.matchConfidence ?? 0,
  match_method: d.matchMethod ?? 'auto',
  scanned_at: d.scannedAt ?? new Date().toISOString(),
})), { onConflict: 'id' })

// ---- 5. document_transactions (junction) ----
const docTxnRows = []
const txnIdSet = new Set(txns.map(t => t.id))
for (const d of docs) {
  for (const tid of d.matchedTransactionIds ?? []) {
    if (txnIdSet.has(tid)) docTxnRows.push({ document_id: d.id, transaction_id: tid })
  }
}
if (docTxnRows.length > 0) {
  await upsertChunked('document_transactions', docTxnRows, { onConflict: 'document_id,transaction_id' })
}

// ---- 6. categorization_rules ----
// Null out FK references that don't resolve to inserted contacts/categories.
const contactIdSet = new Set(contacts.map(c => c.id))
const categoryIdSet = new Set(cats.map(c => c.id))
await upsertChunked('categorization_rules', rules.map(r => ({
  id: r.id, name: r.name, priority: r.priority ?? 0,
  match_type: r.matchType ?? 'contains', pattern: r.pattern,
  case_sensitive: !!r.caseSensitive,
  category_id: r.categoryId && categoryIdSet.has(r.categoryId) ? r.categoryId : null,
  contact_id:  r.contactId  && contactIdSet.has(r.contactId)   ? r.contactId  : null,
  enabled: r.enabled !== false, applied_count: r.appliedCount ?? 0,
  source: r.source ?? 'manual',
  created_at: r.createdAt ?? new Date().toISOString(),
  updated_at: r.updatedAt ?? new Date().toISOString(),
})), { onConflict: 'id' })

// ---- 7. vendor_aliases ----
// vendor_aliases has a NOT NULL FK to contacts — drop rows whose contact
// no longer exists.
const validAliases = vendorAliases.filter(a => contactIdSet.has(a.contactId))
const droppedAliases = vendorAliases.length - validAliases.length
if (droppedAliases > 0) console.log(`  (skipping ${droppedAliases} aliases pointing to deleted contacts)`)
await upsertChunked('vendor_aliases', validAliases.map(a => ({
  extracted_vendor: a.extractedVendor,
  contact_id: a.contactId,
  learned_at: a.learnedAt ?? new Date().toISOString(),
})), { onConflict: 'extracted_vendor' })

// ---- 8. invoice_templates ----
// Same hard FK as vendor_aliases — drop orphans rather than failing.
const validTmpls = tmpls.filter(t => contactIdSet.has(t.contactId))
const droppedTmpls = tmpls.length - validTmpls.length
if (droppedTmpls > 0) console.log(`  (skipping ${droppedTmpls} templates pointing to deleted contacts)`)
await upsertChunked('invoice_templates', validTmpls.map(t => ({
  id: t.id, contact_id: t.contactId, signature: t.signature,
  learned_from_doc_id: t.learnedFromDocId ?? null,
  learned_at: t.learnedAt ?? new Date().toISOString(),
})), { onConflict: 'id' })

// ---- 9. vendor_extraction_rules ----
await upsertChunked('vendor_extraction_rules', exrules.map(r => ({
  id: r.id, vendor_normalized: r.vendorNormalized,
  field: r.field, label: r.label,
  evidence: r.evidence ?? [],
})), { onConflict: 'id' })

// ---- 10. app_settings ----
const { error: setErr } = await supabase.from('app_settings').upsert({
  id: 'main',
  version: settings.version ?? 1,
  default_bank: settings.defaultBank ?? 'chase',
  csv_date_format: settings.csvDateFormat ?? 'MM-DD-YYYY',
  theme: settings.theme ?? 'light',
  default_sort_field: settings.defaultSort?.field ?? 'date',
  default_sort_dir: settings.defaultSort?.direction ?? 'desc',
  date_proximity_days: settings.dateProximityDays ?? 30,
  business_name: settings.businessName ?? '',
  business_tax_id: settings.businessTaxId ?? '',
  custom_amount_labels: Array.isArray(settings.customAmountLabels) ? settings.customAmountLabels : [],
  contract_patterns: Array.isArray(settings.contractPatterns) ? settings.contractPatterns : [],
}, { onConflict: 'id' })
if (setErr) { console.error('app_settings upsert failed:', setErr); process.exit(1) }
console.log('  app_settings: 1 row')

console.log()
console.log('Migration complete.')
