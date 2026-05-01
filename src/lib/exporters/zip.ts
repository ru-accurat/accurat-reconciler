import archiver from 'archiver'
import type { Readable } from 'node:stream'
import { PassThrough } from 'node:stream'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Transaction,
  DocumentRecord,
  Contact,
  Category,
} from '@/lib/types'
import { buildSemanticPath } from '@/lib/storage-naming'

export interface BundleInput {
  transactions: Transaction[]
  documents: DocumentRecord[]
  contacts: Contact[]
  categories: Category[]
  workbookBuffer: Buffer
  workbookFilename: string  // e.g. "Reconciliation_2026-04.xlsx"
  supabase: SupabaseClient
}

/**
 * Stream a zip file containing:
 *   <workbookFilename>
 *   Documents/<YYYY-MM>/<semantic-name>.pdf   (one folder per month;
 *                                              undated docs land in
 *                                              `Documents/unknown-date/`)
 *   README.txt
 *
 * Returns a stream that can be piped to a Response body.  Caller should
 * await `archive.finalize()` indirectly via stream consumption.
 */
export function buildBundleStream(input: BundleInput): Readable {
  const archive = archiver('zip', { zlib: { level: 6 } })
  const out = new PassThrough()
  archive.pipe(out)

  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') console.warn('zip warning:', err)
  })
  archive.on('error', (err) => {
    out.destroy(err)
  })

  const generatedAt = new Date().toISOString()
  const totals = computeTotals(input)

  // 1. workbook
  archive.append(input.workbookBuffer, { name: input.workbookFilename })

  // 2. README.txt
  archive.append(buildReadme(input, totals, generatedAt), { name: 'README.txt' })

  // 3. PDFs — fire off in parallel batches so we don't hit Storage with
  // 130 sequential GETs.  archiver buffers correctly across awaits.
  const pdfTasks = buildPdfPlan(input)
  ;(async () => {
    const BATCH = 8
    for (let i = 0; i < pdfTasks.length; i += BATCH) {
      const batch = pdfTasks.slice(i, i + BATCH)
      const blobs = await Promise.all(batch.map(async (task) => {
        const { data, error } = await input.supabase.storage
          .from('documents')
          .download(task.storedPath)
        if (error) {
          console.warn(`zip: skipping ${task.storedPath} (${error.message})`)
          return null
        }
        return { task, blob: data }
      }))
      for (const item of blobs) {
        if (!item) continue
        const buf = Buffer.from(await item.blob.arrayBuffer())
        archive.append(buf, { name: item.task.bundlePath })
      }
    }
    archive.finalize()
  })().catch((err) => {
    out.destroy(err)
  })

  return out
}

interface PdfTask {
  storedPath: string
  bundlePath: string
}

function buildPdfPlan(input: BundleInput): PdfTask[] {
  const tasks: PdfTask[] = []
  const categoryById = new Map(input.categories.map(c => [c.id, c]))
  const txnById      = new Map(input.transactions.map(t => [t.id, t]))

  for (const d of input.documents) {
    // Compute the storage path from doc fields rather than trusting
    // d.storedPath — the DB column can drift relative to actual storage
    // when an external rename runs concurrently with a browser auto-save.
    // The semantic path is deterministic from (date, vendor, direction,
    // category) so we just rebuild it here.
    const matchedTxn = (d.matchedTransactionIds ?? []).map(id => txnById.get(id)).find(t => t?.categoryId)
    const categoryName = matchedTxn?.categoryId ? categoryById.get(matchedTxn.categoryId)?.name ?? null : null
    const computed = buildSemanticPath(d, { category: categoryName })
    const monthFolder = monthSlugFor(d.extractedDate)
    const filename = computed.split('/').pop() ?? d.originalFilename
    tasks.push({
      storedPath: computed,
      bundlePath: `Documents/${monthFolder}/${filename}`,
    })
  }
  return tasks
}

function monthSlugFor(date: string | null | undefined): string {
  if (!date) return 'unknown-date'
  const m = /^(\d{4})-(\d{2})/.exec(date)
  return m ? `${m[1]}-${m[2]}` : 'unknown-date'
}

interface Totals {
  txnCount: number
  docCount: number
  reconciled: number
  unreconciled: number
  unmatched: number
  income: number
  expenses: number
  net: number
  dateRange: { from: string; to: string } | null
}

function computeTotals({ transactions, documents }: BundleInput): Totals {
  let income = 0, expenses = 0
  let from = '', to = ''
  for (const t of transactions) {
    if (t.amount > 0) income += t.amount
    else expenses += t.amount
    if (!from || t.date < from) from = t.date
    if (!to   || t.date > to)   to = t.date
  }
  return {
    txnCount: transactions.length,
    docCount: documents.length,
    reconciled:   transactions.filter(t => t.status === 'reconciled').length,
    unreconciled: transactions.filter(t => t.status === 'unreconciled').length,
    unmatched:    documents.filter(d => (d.matchedTransactionIds ?? []).length === 0).length,
    income,
    expenses,
    net: income + expenses,
    dateRange: from && to ? { from, to } : null,
  }
}

function buildReadme(_: BundleInput, t: Totals, generatedAt: string): string {
  const lines = [
    `Reconciler export`,
    `Generated:   ${generatedAt}`,
    t.dateRange ? `Date range:  ${t.dateRange.from} → ${t.dateRange.to}` : `Date range:  (none)`,
    ``,
    `Transactions: ${t.txnCount}`,
    `  reconciled:   ${t.reconciled}`,
    `  unreconciled: ${t.unreconciled}`,
    ``,
    `Documents:    ${t.docCount}`,
    `  unmatched:    ${t.unmatched}`,
    ``,
    `Income:       ${t.income.toFixed(2)}`,
    `Expenses:     ${t.expenses.toFixed(2)}`,
    `Net:          ${t.net.toFixed(2)}`,
    ``,
    `Documents/ folder is organized by month (YYYY-MM); each file's`,
    `name encodes its date, direction, vendor, and category.`,
  ]
  return lines.join('\n')
}
