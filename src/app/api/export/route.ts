import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Readable } from 'node:stream'
import { buildWorkbookBuffer } from '@/lib/exporters/xlsx'
import { buildBundleStream } from '@/lib/exporters/zip'
import type {
  Transaction,
  DocumentRecord,
  Contact,
  Category,
} from '@/lib/types'

// Stream a zip with a multi-sheet xlsx + organized PDF folder bundle.
// Filters can be passed via querystring:
//   ?from=2026-01-01&to=2026-04-30
//   ?status=reconciled,unreconciled (CSV)
//   ?categoryIds=cat-024,cat-016    (CSV)
// Response is content-type application/zip.

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env not set' }, { status: 500 })
  const supabase = createClient(url, key)

  // Read from the relational tables (Phase 4 schema).
  const [{ data: txnRows }, { data: docRows }, { data: contactRows }, { data: catRows }, { data: junction }] =
    await Promise.all([
      supabase.from('transactions').select('*'),
      supabase.from('documents').select('*'),
      supabase.from('contacts').select('*'),
      supabase.from('categories').select('*'),
      supabase.from('document_transactions').select('document_id, transaction_id'),
    ])

  const txnsByDoc = new Map<string, string[]>()
  for (const j of junction ?? []) {
    const arr = txnsByDoc.get(j.document_id) ?? []
    arr.push(j.transaction_id)
    txnsByDoc.set(j.document_id, arr)
  }

  const allTxns: Transaction[] = (txnRows ?? []).map((r: any) => ({
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
  const allDocs: DocumentRecord[] = (docRows ?? []).map((r: any) => ({
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
  const categories: Category[] = (catRows ?? []).map((r: any) => ({
    id: r.id, name: r.name, color: r.color, parentId: r.parent_id ?? null, isDefault: !!r.is_default,
  }))

  const search = new URL(req.url).searchParams
  const from = search.get('from') ?? null
  const to   = search.get('to')   ?? null
  const statusFilter = csvSet(search.get('status'))
  const catFilter    = csvSet(search.get('categoryIds'))

  const transactions = allTxns.filter(t => {
    if (from && t.date < from) return false
    if (to && t.date > to) return false
    if (statusFilter && !statusFilter.has(t.status)) return false
    if (catFilter && !(t.categoryId && catFilter.has(t.categoryId))) return false
    return true
  })

  // Documents: keep those whose extracted date is in range OR that are
  // matched to one of the surviving transactions.
  const txnIds = new Set(transactions.map(t => t.id))
  const documents = allDocs.filter(d => {
    if ((d.matchedTransactionIds ?? []).some(id => txnIds.has(id))) return true
    if (from && (d.extractedDate ?? '') < from) return false
    if (to && (d.extractedDate ?? '9999') > to) return false
    return !statusFilter && !catFilter // when filters are off, include unmatched docs
  })

  const generatedAt = new Date().toISOString()
  const datestamp = generatedAt.slice(0, 10)
  const monthstamp = generatedAt.slice(0, 7)
  const workbookFilename = `Reconciliation_${monthstamp}.xlsx`
  const zipFilename = `reconciler-export-${datestamp}.zip`

  const workbookBuffer = await buildWorkbookBuffer({
    transactions, documents, contacts, categories, generatedAt,
  })

  const stream = buildBundleStream({
    transactions, documents, contacts, categories,
    workbookBuffer, workbookFilename, supabase,
  })

  // Adapt Node Readable → Web ReadableStream for the Response body.
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function csvSet(v: string | null): Set<string> | null {
  if (!v) return null
  const parts = v.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length === 0 ? null : new Set(parts)
}
