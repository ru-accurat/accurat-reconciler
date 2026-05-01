/**
 * Build the multi-sheet, color-coded reconciliation workbook.
 *
 * Sheets:
 *   1. Transactions  — all current cols + Vendor / Direction / Invoice # /
 *      Match Confidence / Linked Doc count.  Row fill colored by status,
 *      amount cells light-shaded by sign.
 *   2. Documents     — every doc with vendor, amount, date, direction,
 *      matched-txn count.
 *   3. By Category   — pivot, totals per category × month.
 *   4. Outstanding   — unmatched docs + unreconciled transactions side by side.
 *
 * Usage (server-side):
 *   const buf = await buildWorkbookBuffer(input)
 *   // buf is a Node Buffer to stream into a zip / write to disk / return.
 */
import ExcelJS from 'exceljs'
import type {
  Transaction,
  DocumentRecord,
  Contact,
  Category,
} from '@/lib/types'
import { buildSemanticPath } from '@/lib/storage-naming'

export interface WorkbookInput {
  transactions: Transaction[]
  documents: DocumentRecord[]
  contacts: Contact[]
  categories: Category[]
  generatedAt?: string
}

const STATUS_FILL: Record<Transaction['status'], string> = {
  reconciled:   'FFD1FAE5', // emerald-100
  unreconciled: 'FFFEF3C7', // amber-100
  flagged:      'FFFEE2E2', // red-100
  contract:     'FFE0E7FF', // indigo-100
  tax:          'FFFFEDD5', // orange-100
}

const HEADER_FILL = 'FF1F2937'    // slate-800 — Accurat-branded header
const HEADER_FONT = 'FFFFFFFF'    // white
const POS_AMOUNT_FILL = 'FFECFDF5' // light emerald
const NEG_AMOUNT_FILL = 'FFFEF2F2' // light red

export async function buildWorkbookBuffer(input: WorkbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Accurat Reconciler'
  wb.created = new Date(input.generatedAt ?? Date.now())

  const contactById  = new Map(input.contacts.map(c => [c.id, c]))
  const categoryById = new Map(input.categories.map(c => [c.id, c]))

  buildTransactionsSheet(wb, input, contactById, categoryById)
  buildDocumentsSheet(wb, input, contactById)
  buildByCategorySheet(wb, input, categoryById)
  buildOutstandingSheet(wb, input, contactById, categoryById)

  // exceljs returns ArrayBuffer at the type level but Node Buffer at runtime.
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}

// ----------------------------------------------------------------------
// Sheet 1 — Transactions
// ----------------------------------------------------------------------
function buildTransactionsSheet(
  wb: ExcelJS.Workbook,
  { transactions, documents }: WorkbookInput,
  contactById: Map<string, Contact>,
  categoryById: Map<string, Category>,
) {
  const ws = wb.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Date',             key: 'date',        width: 12 },
    { header: 'Description',      key: 'desc',        width: 50 },
    { header: 'Amount',           key: 'amount',      width: 12 },
    { header: 'Type',             key: 'type',        width: 8  },
    { header: 'Status',           key: 'status',      width: 13 },
    { header: 'Contact',          key: 'contact',     width: 22 },
    { header: 'Category',         key: 'category',    width: 22 },
    { header: 'Notes',            key: 'notes',       width: 30 },
    { header: 'Billing Period',   key: 'period',      width: 14 },
    { header: 'Linked Documents', key: 'linkedDocs',  width: 18 },
    { header: 'Vendors',          key: 'vendors',     width: 25 },
    { header: 'Direction',        key: 'direction',   width: 12 },
    { header: 'Match Confidence', key: 'confidence',  width: 12 },
  ]
  styleHeader(ws.getRow(1))

  // Build a map: txnId -> documents linked to it
  const docsByTxn = new Map<string, DocumentRecord[]>()
  for (const d of documents) {
    for (const tid of d.matchedTransactionIds ?? []) {
      const arr = docsByTxn.get(tid) ?? []
      arr.push(d)
      docsByTxn.set(tid, arr)
    }
  }

  const sortedTxns = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sortedTxns) {
    const contact  = t.contactId  ? contactById.get(t.contactId)?.name  ?? '' : ''
    const category = t.categoryId ? categoryById.get(t.categoryId)?.name ?? '' : ''
    const linkedDocs = docsByTxn.get(t.id) ?? []
    const vendors = linkedDocs.map(d => d.extractedVendor).filter(Boolean).join(', ')
    const direction = linkedDocs.length === 1 ? linkedDocs[0].direction : ''
    const confidence = linkedDocs.length > 0
      ? Math.max(...linkedDocs.map(d => d.matchConfidence ?? 0)).toFixed(2)
      : ''
    const row = ws.addRow({
      date:       t.date,
      desc:       t.rawDescription,
      amount:     t.amount,
      type:       t.type,
      status:     t.status,
      contact,
      category,
      notes:      t.notes,
      period:     t.billingPeriod ? `${t.billingPeriod.month}/${t.billingPeriod.year}` : '',
      linkedDocs: linkedDocs.length,
      vendors,
      direction,
      confidence,
    })
    // Status fill across the whole row.
    const statusFill = STATUS_FILL[t.status]
    if (statusFill) {
      row.eachCell({ includeEmpty: false }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill } }
      })
    }
    // Amount cell sign-shaded on top.
    const amtCell = row.getCell('amount')
    amtCell.numFmt = '#,##0.00;[Red]-#,##0.00'
    amtCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: t.amount >= 0 ? POS_AMOUNT_FILL : NEG_AMOUNT_FILL },
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }
}

// ----------------------------------------------------------------------
// Sheet 2 — Documents
// ----------------------------------------------------------------------
function buildDocumentsSheet(
  wb: ExcelJS.Workbook,
  { documents, transactions, categories }: WorkbookInput,
  contactById: Map<string, Contact>,
) {
  const ws = wb.addWorksheet('Documents', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Date',             key: 'date',       width: 12 },
    { header: 'Direction',        key: 'direction',  width: 12 },
    { header: 'Vendor',           key: 'vendor',     width: 28 },
    { header: 'Amount',           key: 'amount',     width: 12 },
    { header: 'Invoice #',        key: 'invoice',    width: 18 },
    { header: 'Filename',         key: 'filename',   width: 70 },
    { header: 'Matched Txns',     key: 'matched',    width: 12 },
    { header: 'Linked Contact',   key: 'contact',    width: 22 },
    { header: 'Match Method',     key: 'method',     width: 10 },
    { header: 'Match Confidence', key: 'conf',       width: 12 },
  ]
  styleHeader(ws.getRow(1))

  const txnById      = new Map(transactions.map(t => [t.id, t]))
  const categoryById = new Map(categories.map(c => [c.id, c]))
  const sorted = [...documents].sort((a, b) => (a.extractedDate ?? '').localeCompare(b.extractedDate ?? ''))
  for (const d of sorted) {
    const firstTxn = (d.matchedTransactionIds ?? []).map(id => txnById.get(id)).find(Boolean)
    const linkedContact = firstTxn?.contactId ? contactById.get(firstTxn.contactId)?.name ?? '' : ''
    // Compute the filename from doc fields rather than reading d.storedPath —
    // the column can drift relative to actual storage during a concurrent
    // rename + auto-save race.  buildSemanticPath is deterministic.
    let categoryName: string | null = null
    let contactNameForPath: string | null = null
    for (const tid of d.matchedTransactionIds ?? []) {
      const t = txnById.get(tid)
      if (!t) continue
      if (!categoryName && t.categoryId) categoryName = categoryById.get(t.categoryId)?.name ?? null
      if (!contactNameForPath && t.contactId) contactNameForPath = contactById.get(t.contactId)?.name ?? null
      if (categoryName && contactNameForPath) break
    }
    const computedPath = buildSemanticPath(d, { category: categoryName, contactName: contactNameForPath })
    const filename = computedPath.split('/').pop() ?? computedPath
    const row = ws.addRow({
      date:      d.extractedDate ?? '',
      direction: d.direction,
      vendor:    d.extractedVendor ?? '',
      amount:    d.extractedAmount ?? '',
      invoice:   d.extractedInvoiceNumber ?? '',
      filename,
      matched:   (d.matchedTransactionIds ?? []).length,
      contact:   linkedContact,
      method:    d.matchMethod,
      conf:      d.matchConfidence ?? 0,
    })
    const amt = row.getCell('amount')
    if (typeof d.extractedAmount === 'number') {
      amt.numFmt = '#,##0.00;[Red]-#,##0.00'
      amt.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: d.direction === 'incoming' ? POS_AMOUNT_FILL : NEG_AMOUNT_FILL },
      }
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }
}

// ----------------------------------------------------------------------
// Sheet 3 — Reconciliation by Category (pivot)
// ----------------------------------------------------------------------
function buildByCategorySheet(
  wb: ExcelJS.Workbook,
  { transactions }: WorkbookInput,
  categoryById: Map<string, Category>,
) {
  const ws = wb.addWorksheet('By Category', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })

  // Collect months and category ids that appear.
  const months = new Set<string>()
  const catIds = new Set<string>()
  for (const t of transactions) {
    months.add(t.date.slice(0, 7))
    if (t.categoryId) catIds.add(t.categoryId)
    else catIds.add('__uncat__')
  }
  const monthList = [...months].sort()

  ws.columns = [
    { header: 'Category', key: 'category', width: 28 },
    ...monthList.map(m => ({ header: m, key: `m_${m}`, width: 13 })),
    { header: 'Total', key: 'total', width: 14 },
  ]
  styleHeader(ws.getRow(1))

  // Aggregate
  const cells: Record<string, Record<string, number>> = {}
  for (const t of transactions) {
    const cid = t.categoryId ?? '__uncat__'
    const m = t.date.slice(0, 7)
    cells[cid] ??= {}
    cells[cid][m] = (cells[cid][m] ?? 0) + t.amount
  }

  const sortedCats = [...catIds].sort((a, b) => {
    const an = a === '__uncat__' ? '~Uncategorized' : (categoryById.get(a)?.name ?? '~?')
    const bn = b === '__uncat__' ? '~Uncategorized' : (categoryById.get(b)?.name ?? '~?')
    return an.localeCompare(bn)
  })

  for (const cid of sortedCats) {
    const cat = cid === '__uncat__' ? null : categoryById.get(cid)
    const rowData: Record<string, string | number> = {
      category: cat?.name ?? '(uncategorized)',
    }
    let total = 0
    for (const m of monthList) {
      const v = cells[cid]?.[m] ?? 0
      rowData[`m_${m}`] = v
      total += v
    }
    rowData.total = total
    const row = ws.addRow(rowData)
    // Color-shade by sign
    for (const m of monthList) {
      const cell = row.getCell(`m_${m}`)
      const v = cells[cid]?.[m] ?? 0
      if (v !== 0) {
        cell.numFmt = '#,##0.00;[Red]-#,##0.00'
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: v >= 0 ? POS_AMOUNT_FILL : NEG_AMOUNT_FILL },
        }
      }
    }
    const tot = row.getCell('total')
    tot.numFmt = '#,##0.00;[Red]-#,##0.00'
    tot.font = { bold: true }
    tot.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: total >= 0 ? POS_AMOUNT_FILL : NEG_AMOUNT_FILL },
    }
  }
}

// ----------------------------------------------------------------------
// Sheet 4 — Outstanding (unmatched docs + unreconciled txns side by side)
// ----------------------------------------------------------------------
function buildOutstandingSheet(
  wb: ExcelJS.Workbook,
  { transactions, documents }: WorkbookInput,
  contactById: Map<string, Contact>,
  categoryById: Map<string, Category>,
) {
  const ws = wb.addWorksheet('Outstanding', { views: [{ state: 'frozen', ySplit: 2 }] })

  // Build columns in two groups: docs (A-E) and txns (G-K). Empty col F as separator.
  ws.columns = [
    { header: '', key: 'd_date',     width: 12 },
    { header: '', key: 'd_vendor',   width: 25 },
    { header: '', key: 'd_amount',   width: 12 },
    { header: '', key: 'd_direction',width: 12 },
    { header: '', key: 'd_file',     width: 30 },
    { header: '', key: 'sep',        width: 4  },
    { header: '', key: 't_date',     width: 12 },
    { header: '', key: 't_desc',     width: 35 },
    { header: '', key: 't_amount',   width: 12 },
    { header: '', key: 't_contact',  width: 22 },
    { header: '', key: 't_category', width: 22 },
  ]
  // Group header row.
  const grp = ws.getRow(1)
  grp.getCell(1).value = 'Unmatched Documents'
  grp.getCell(7).value = 'Unreconciled Transactions'
  ws.mergeCells(1, 1, 1, 5)
  ws.mergeCells(1, 7, 1, 11)
  for (const c of [1, 7]) {
    const cell = grp.getCell(c)
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 12 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center' }
  }
  // Column header row.
  const headers = ['Date','Vendor','Amount','Direction','File','','Date','Description','Amount','Contact','Category']
  const hdr = ws.getRow(2)
  headers.forEach((h, i) => { hdr.getCell(i + 1).value = h })
  styleHeader(hdr)
  hdr.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }

  const unmatchedDocs = documents
    .filter(d => (d.matchedTransactionIds ?? []).length === 0)
    .sort((a, b) => (a.extractedDate ?? '').localeCompare(b.extractedDate ?? ''))
  const unreconciledTxns = transactions
    .filter(t => t.status === 'unreconciled')
    .sort((a, b) => a.date.localeCompare(b.date))

  const rowCount = Math.max(unmatchedDocs.length, unreconciledTxns.length)
  for (let i = 0; i < rowCount; i++) {
    const d = unmatchedDocs[i]
    const t = unreconciledTxns[i]
    const row = ws.addRow({
      d_date:      d?.extractedDate ?? '',
      d_vendor:    d?.extractedVendor ?? '',
      d_amount:    d?.extractedAmount ?? '',
      d_direction: d?.direction ?? '',
      d_file:      d?.originalFilename ?? '',
      t_date:      t?.date ?? '',
      t_desc:      t?.rawDescription ?? '',
      t_amount:    t?.amount ?? '',
      t_contact:   t?.contactId  ? contactById.get(t.contactId)?.name  ?? '' : '',
      t_category:  t?.categoryId ? categoryById.get(t.categoryId)?.name ?? '' : '',
    })
    if (d) {
      const c = row.getCell('d_amount')
      c.numFmt = '#,##0.00;[Red]-#,##0.00'
    }
    if (t) {
      const c = row.getCell('t_amount')
      c.numFmt = '#,##0.00;[Red]-#,##0.00'
    }
  }
}

// ----------------------------------------------------------------------
function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: HEADER_FONT } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  row.alignment = { vertical: 'middle', horizontal: 'left' }
  row.height = 22
}
