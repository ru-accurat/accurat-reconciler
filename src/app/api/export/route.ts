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

// Supports three export modes via ?type=:
//   type=zip  (default) — Excel workbook + organized PDFs in one .zip
//   type=xlsx           — Excel workbook only (.xlsx)
//   type=csv            — Transactions as plain CSV (.csv)
//
// Common filter params:
//   ?from=2026-01-01&to=2026-04-30
//   ?status=reconciled,unreconciled  (CSV list)
//   ?categoryIds=cat-024,cat-016     (CSV list)

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env not set' }, { status: 500 })
  const supabase = createClient(url, key)

  const search = new URL(req.url).searchParams
  const exportType = (search.get('type') ?? 'zip') as 'zip' | 'xlsx' | 'csv'
  const from = search.get('from') ?? null
  const to   = search.get('to')   ?? null
  const statusFilter = csvSet(search.get('status'))
  const catFilter    = csvSet(search.get('categoryIds'))
  const datestamp = new Date().toISOString().slice(0, 10)
  const monthstamp = new Date().toISOString().slice(0, 7)

  // --- Fetch data ---
  const needDocs = exportType === 'zip' || exportType === 'xlsx'
  const [{ data: txnRows }, docResult, { data: contactRows }, { data: catRows }, junctionResult] =
    await Promise.all([
      supabase.from('transactions').select('*'),
      needDocs ? supabase.from('documents').select('*') : Promise.resolve({ data: [] }),
      supabase.from('contacts').select('*'),
      supabase.from('categories').select('*'),
      needDocs ? supabase.from('document_transactions').select('document_id, transaction_id') : Promise.resolve({ data: [] }),
    ])
  const { data: docRows } = docResult as { data: any[] }
  const { data: junction } = junctionResult as { data: any[] }

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

  // --- Apply filters ---
  const transactions = allTxns.filter(t => {
    if (from && t.date < from) return false
    if (to && t.date > to) return false
    if (statusFilter && !statusFilter.has(t.status)) return false
    if (catFilter && !(t.categoryId && catFilter.has(t.categoryId))) return false
    return true
  })

  const txnIds = new Set(transactions.map(t => t.id))
  const documents = allDocs.filter(d => {
    if ((d.matchedTransactionIds ?? []).some(id => txnIds.has(id))) return true
    if (from && (d.extractedDate ?? '') < from) return false
    if (to && (d.extractedDate ?? '9999') > to) return false
    return !statusFilter && !catFilter
  })

  const generatedAt = new Date().toISOString()

  // --- CSV export ---
  if (exportType === 'csv') {
    const catById = new Map(categories.map(c => [c.id, c]))
    const contactById = new Map(contacts.map(c => [c.id, c]))
    const lines: string[] = [
      [
        'Date', 'Description', 'Amount', 'Type', 'Status',
        'Contact', 'Category', 'Notes', 'Billing Period', 'Imported At',
      ].map(csvEscape).join(',')
    ]
    for (const t of transactions) {
      const contact  = t.contactId  ? (contactById.get(t.contactId)?.name  ?? '') : ''
      const category = t.categoryId ? (catById.get(t.categoryId)?.name ?? '') : ''
      const billing  = t.billingPeriod
        ? `${t.billingPeriod.year}-${String(t.billingPeriod.month).padStart(2, '0')}`
        : ''
      lines.push([
        t.date,
        t.rawDescription,
        t.amount.toFixed(2),
        t.type,
        t.status,
        contact,
        category,
        t.notes ?? '',
        billing,
        t.importedAt ?? '',
      ].map(csvEscape).join(','))
    }
    const csv = lines.join('\r\n')
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="transactions-${datestamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // --- XLSX export ---
  if (exportType === 'xlsx') {
    const workbookBuffer = await buildWorkbookBuffer({
      transactions, documents, contacts, categories, generatedAt,
    })
    return new Response(new Uint8Array(workbookBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Reconciliation_${monthstamp}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // --- ZIP export (default) ---
  const workbookFilename = `Reconciliation_${monthstamp}.xlsx`
  const zipFilename = `reconciler-export-${datestamp}.zip`

  const workbookBuffer = await buildWorkbookBuffer({
    transactions, documents, contacts, categories, generatedAt,
  })

  const stream = buildBundleStream({
    transactions, documents, contacts, categories,
    workbookBuffer, workbookFilename, supabase,
  })

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

function csvEscape(v: string | number | undefined | null): string {
  const s = String(v ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
