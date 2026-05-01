import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { matchDocument, isAutoMatch, findAutoMatchIds } from '@/lib/document-matcher'
import { Transaction, DocumentRecord, Contact, VendorAlias } from '@/lib/types'
import { InvoiceTemplate } from '@/lib/invoice-template'

// Re-runs the document matcher across every unmatched DocumentRecord using
// the latest templates and the transactions-already-claimed exclusion set.
// Returns the list of proposed auto-matches; the caller is responsible for
// applying them. Read-only — does not mutate Supabase.
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env not set' }, { status: 500 })
  const supabase = createClient(url, key)

  // Read straight from the relational tables (Phase 4 schema).
  const [{ data: txnRows }, { data: docRows }, { data: contactRows }, { data: aliasRows }, { data: tmplRows }, { data: junction }] =
    await Promise.all([
      supabase.from('transactions').select('*'),
      supabase.from('documents').select('*'),
      supabase.from('contacts').select('*'),
      supabase.from('vendor_aliases').select('*'),
      supabase.from('invoice_templates').select('*'),
      supabase.from('document_transactions').select('document_id, transaction_id'),
    ])

  const txnsByDoc = new Map<string, string[]>()
  for (const j of junction ?? []) {
    const arr = txnsByDoc.get(j.document_id) ?? []
    arr.push(j.transaction_id)
    txnsByDoc.set(j.document_id, arr)
  }

  const transactions: Transaction[] = (txnRows ?? []).map((r: any) => ({
    id: r.id, hash: r.hash, date: r.date,
    rawDescription: r.raw_description, amount: Number(r.amount), type: r.type,
    contactId: r.contact_id, categoryId: r.category_id,
    billingPeriod: r.billing_period_year != null && r.billing_period_month != null
      ? { year: r.billing_period_year, month: r.billing_period_month } : null,
    billingPeriodOverride: !!r.billing_period_override,
    status: r.status, documentIds: [],
    splitParts: r.split_parts ?? null,
    notes: r.notes ?? '', ruleIdApplied: r.rule_id_applied ?? null,
    importedAt: r.imported_at, updatedAt: r.updated_at,
  }))
  const docs: DocumentRecord[] = (docRows ?? []).map((r: any) => ({
    id: r.id, originalFilename: r.original_filename, storedPath: r.stored_path,
    thumbnailPath: r.thumbnail_path ?? null,
    historicalPaths: Array.isArray(r.historical_paths) ? r.historical_paths : [],
    extractedText: r.extracted_text ?? '',
    extractedDate: r.extracted_date ?? null,
    extractedAmount: r.extracted_amount != null ? Number(r.extracted_amount) : null,
    extractedVendor: r.extracted_vendor ?? null,
    extractedInvoiceNumber: r.extracted_invoice_number ?? null,
    extractedBillingPeriod: r.extracted_billing_year != null && r.extracted_billing_month != null
      ? { year: r.extracted_billing_year, month: r.extracted_billing_month } : null,
    extractedEntities: r.extracted_entities ?? undefined,
    direction: r.direction ?? 'incoming',
    matchedTransactionIds: txnsByDoc.get(r.id) ?? [],
    matchConfidence: Number(r.match_confidence ?? 0),
    matchMethod: r.match_method ?? 'auto',
    scannedAt: r.scanned_at,
  }))
  const contacts: Contact[] = (contactRows ?? []).map((r: any) => ({
    id: r.id, name: r.name, legalEntityName: r.legal_entity_name ?? '', type: r.type,
    vatTaxId: r.vat_tax_id ?? '', address: r.address ?? '', email: r.email ?? '', phone: r.phone ?? '',
    notes: r.notes ?? '',
    transactionPatterns: Array.isArray(r.transaction_patterns) ? r.transaction_patterns : [],
    source: r.source ?? 'manual',
    createdAt: r.created_at, updatedAt: r.updated_at,
  }))
  const vendorAliases: VendorAlias[] = (aliasRows ?? []).map((r: any) => ({
    extractedVendor: r.extracted_vendor, contactId: r.contact_id, learnedAt: r.learned_at,
  }))
  const templates: InvoiceTemplate[] = (tmplRows ?? []).map((r: any) => ({
    id: r.id, contactId: r.contact_id, signature: r.signature,
    learnedFromDocId: r.learned_from_doc_id ?? null, learnedAt: r.learned_at,
  }))

  const claimedTxnIds = new Set<string>(docs.flatMap(d => d.matchedTransactionIds ?? []))
  const unmatched = docs.filter(d => (d.matchedTransactionIds ?? []).length === 0)

  const proposals: Array<{
    docId: string
    originalFilename: string
    extractedVendor: string | null
    extractedAmount: number | null
    transactionIds: string[]
    score: number
    templateMatchScore?: number
    templateContactId?: string | null
    contactName: string | null
  }> = []

  const contactById = new Map(contacts.map(c => [c.id, c]))

  for (const doc of unmatched) {
    const candidates = matchDocument(doc, transactions, contacts, vendorAliases, templates, claimedTxnIds)
    const matchIds = findAutoMatchIds(candidates, transactions, claimedTxnIds)
    if (matchIds.length === 0) continue
    for (const id of matchIds) claimedTxnIds.add(id)
    const best = candidates[0]
    const txn = transactions.find(t => t.id === best.transactionId)
    proposals.push({
      docId: doc.id,
      originalFilename: doc.originalFilename,
      extractedVendor: doc.extractedVendor ?? null,
      extractedAmount: doc.extractedAmount ?? null,
      transactionIds: matchIds,
      score: best.score,
      templateMatchScore: best.templateMatchScore,
      templateContactId: best.templateContactId,
      contactName: txn?.contactId ? contactById.get(txn.contactId)?.name ?? null : null,
    })
  }

  return NextResponse.json({
    totalDocs: docs.length,
    unmatched: unmatched.length,
    claimedBefore: docs.flatMap(d => d.matchedTransactionIds ?? []).length,
    proposals,
  })
}
