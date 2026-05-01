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

  const fetchKey = async <T,>(k: string, field: string, legacyField?: string): Promise<T[]> => {
    const { data } = await supabase.from('app_data').select('value').eq('key', k).single()
    const items = data?.value?.[field] ?? (legacyField ? data?.value?.[legacyField] : undefined)
    return (items ?? []) as T[]
  }

  const [allTxns, allDocs, contacts, categories] = await Promise.all([
    fetchKey<Transaction>('transactions', 'transactions'),
    fetchKey<DocumentRecord>('documents', 'documents'),
    fetchKey<Contact>('contacts', 'contacts'),
    fetchKey<Category>('categories', 'categories'),
  ])

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
