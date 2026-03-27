'use client'
import React, { useMemo, useState } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  flexRender, createColumnHelper, SortingState
} from '@tanstack/react-table'
import { ArrowUpDown, Paperclip, ChevronDown, ChevronUp, MessageSquare, Lightbulb } from 'lucide-react'
import { Transaction } from '@/lib/types'
import { useTransactionStore } from '@/stores/transactionStore'
import { useContactStore } from '@/stores/contactStore'
import { useCategoryStore } from '@/stores/categoryStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useUIStore } from '@/stores/uiStore'
import { formatCurrency, formatDate, cleanDescription } from '@/lib/formatters'
import InlineSelect from '@/components/ui/InlineSelect'
import MonthYearPicker from '@/components/ui/MonthYearPicker'
import CreateRuleDialog from './CreateRuleDialog'

const columnHelper = createColumnHelper<Transaction>()

export default function TransactionTable() {
  const transactions = useTransactionStore((s) => s.transactions)
  const updateTransaction = useTransactionStore((s) => s.updateTransaction)
  const contacts = useContactStore((s) => s.contacts)
  const categories = useCategoryStore((s) => s.categories)
  const { filters, selectedTransactionIds, toggleTransactionSelection, selectAllTransactions, clearSelection } = useUIStore()

  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<{ id: string; text: string } | null>(null)
  const [createRuleData, setCreateRuleData] = useState<{ isOpen: boolean; description: string; categoryId: string | null; contactId: string | null }>({ isOpen: false, description: '', categoryId: null, contactId: null })

  const filteredTransactions = useMemo(() => {
    let result = [...transactions]
    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter((t) => t.rawDescription.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || contacts.find((c) => c.id === t.contactId)?.name.toLowerCase().includes(q))
    }
    if (filters.dateFrom) result = result.filter((t) => t.date >= filters.dateFrom)
    if (filters.dateTo) result = result.filter((t) => t.date <= filters.dateTo)
    if (filters.status !== 'all') result = result.filter((t) => t.status === filters.status)
    if (filters.type !== 'all') result = result.filter((t) => t.type === filters.type)
    if (filters.amountMin) { const min = parseFloat(filters.amountMin); if (!isNaN(min)) result = result.filter((t) => Math.abs(t.amount) >= min) }
    if (filters.amountMax) { const max = parseFloat(filters.amountMax); if (!isNaN(max)) result = result.filter((t) => Math.abs(t.amount) <= max) }
    if (filters.categoryIds.length > 0) { const catSet = new Set(filters.categoryIds); result = result.filter((t) => t.categoryId && catSet.has(t.categoryId)) }
    if (filters.contactIds.length > 0) { const conSet = new Set(filters.contactIds); result = result.filter((t) => t.contactId && conSet.has(t.contactId)) }
    return result
  }, [transactions, filters, contacts])

  const categoryOptions = useMemo(() => {
    const topLevel = categories.filter((c) => c.parentId === null)
    const opts: { value: string; label: string; color: string }[] = []
    topLevel.forEach((parent) => {
      categories.filter((c) => c.parentId === parent.id).forEach((child) => {
        opts.push({ value: child.id, label: child.name, color: child.color })
      })
    })
    return opts
  }, [categories])

  const contactOptions = useMemo(() => {
    return contacts.sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({
      value: c.id, label: c.name,
      color: c.type === 'client' ? '#10b981' : c.type === 'vendor' ? '#3b82f6' : '#8b5cf6'
    }))
  }, [contacts])

  const statusOptions = [
    { value: 'unreconciled', label: 'Unreconciled', color: '#f59e0b' },
    { value: 'reconciled', label: 'Reconciled', color: '#10b981' },
    { value: 'flagged', label: 'Flagged', color: '#ef4444' },
    { value: 'contract', label: 'Contract', color: '#6366f1' }
  ]

  const handleCategoryChange = (transactionId: string, categoryId: string | null) => {
    const txn = transactions.find((t) => t.id === transactionId)
    if (!txn) return
    updateTransaction(transactionId, { categoryId })
    if (categoryId && !txn.ruleIdApplied) {
      setCreateRuleData({ isOpen: true, description: txn.rawDescription, categoryId, contactId: txn.contactId })
    }
  }

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: () => (
        <input type="checkbox" className="rounded"
          checked={selectedTransactionIds.length === filteredTransactions.length && filteredTransactions.length > 0}
          onChange={(e) => { if (e.target.checked) selectAllTransactions(filteredTransactions.map((t) => t.id)); else clearSelection() }} />
      ),
      cell: ({ row }) => (
        <input type="checkbox" className="rounded"
          checked={selectedTransactionIds.includes(row.original.id)}
          onChange={() => toggleTransactionSelection(row.original.id)} />
      ),
      size: 40
    }),
    columnHelper.accessor('date', {
      header: 'Date',
      cell: (info) => <span className="text-sm whitespace-nowrap">{formatDate(info.getValue())}</span>,
      size: 110
    }),
    columnHelper.accessor('rawDescription', {
      header: 'Description',
      cell: (info) => <span className="text-sm truncate block max-w-[280px]" title={info.getValue()}>{cleanDescription(info.getValue())}</span>,
      size: 280
    }),
    columnHelper.accessor('contactId', {
      header: 'Contact',
      cell: (info) => {
        const txn = info.row.original
        return (
          <InlineSelect value={txn.contactId} options={contactOptions}
            onChange={(val) => updateTransaction(txn.id, { contactId: val })}
            placeholder="—" searchable
            renderValue={(opt) => (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                <span className="truncate">{opt.label}</span>
              </span>
            )} />
        )
      },
      size: 170
    }),
    columnHelper.accessor('categoryId', {
      header: 'Category',
      cell: (info) => {
        const txn = info.row.original
        return (
          <InlineSelect value={txn.categoryId} options={categoryOptions}
            onChange={(val) => handleCategoryChange(txn.id, val)}
            placeholder="—" searchable
            renderValue={(opt) => (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: opt.color + '20', color: opt.color }}>
                {opt.label}
              </span>
            )} />
        )
      },
      size: 160
    }),
    columnHelper.accessor('amount', {
      header: 'Amount',
      cell: (info) => {
        const amount = info.getValue()
        return <span className={`text-sm font-medium tabular-nums ${amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{amount >= 0 ? '+' : '-'}{formatCurrency(amount)}</span>
      },
      size: 120
    }),
    columnHelper.accessor('billingPeriod', {
      header: 'Period',
      cell: (info) => {
        const txn = info.row.original
        return <MonthYearPicker value={txn.billingPeriod} onChange={(val) => updateTransaction(txn.id, { billingPeriod: val, billingPeriodOverride: val !== null })} />
      },
      size: 100
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const txn = info.row.original
        return (
          <InlineSelect value={txn.status} options={statusOptions}
            onChange={(val) => { if (val) updateTransaction(txn.id, { status: val as Transaction['status'] }) }}
            allowClear={false}
            renderValue={(opt) => {
              const styles: Record<string, string> = {
                reconciled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                unreconciled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                flagged: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                contract: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
              }
              return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[opt.value] || ''}`}>{opt.label}</span>
            }} />
        )
      },
      size: 120
    }),
    columnHelper.display({
      id: 'indicators',
      header: '',
      cell: ({ row }) => {
        const txn = row.original
        return (
          <div className="flex items-center gap-1.5">
            {txn.documentIds.length > 0 && <span className="flex items-center gap-0.5 text-primary-600"><Paperclip size={13} /><span className="text-xs">{txn.documentIds.length}</span></span>}
            {txn.notes && <span title={txn.notes}><MessageSquare size={13} className="text-gray-400" /></span>}
            {txn.ruleIdApplied && <span title="Auto-categorized by rule"><Lightbulb size={13} className="text-amber-400" /></span>}
          </div>
        )
      },
      size: 70
    }),
    columnHelper.display({
      id: 'expand',
      header: '',
      cell: ({ row }) => (
        <button onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === row.original.id ? null : row.original.id) }}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors">
          {expandedId === row.original.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>
      ),
      size: 40
    })
  ], [contacts, categories, filteredTransactions, selectedTransactionIds, contactOptions, categoryOptions, expandedId])

  const table = useReactTable({
    data: filteredTransactions, columns,
    state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel()
  })

  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-gray-200 dark:border-gray-700">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider" style={{ width: header.getSize() }}>
                      {header.isPlaceholder ? null : (
                        <button className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && <ArrowUpDown size={12} className="opacity-40" />}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const borderColor = row.original.status === 'reconciled' ? 'border-l-emerald-500' : row.original.status === 'flagged' ? 'border-l-red-500' : row.original.status === 'contract' ? 'border-l-indigo-500' : 'border-l-amber-500'
                const isExpanded = expandedId === row.original.id
                return (
                  <React.Fragment key={row.id}>
                    <tr className={`border-b border-gray-100 dark:border-gray-800 border-l-4 ${borderColor} hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer`}
                      onClick={() => setExpandedId(isExpanded ? null : row.original.id)}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                        <td colSpan={columns.length} className="px-6 py-4">
                          <ExpandedRow transaction={row.original} editingNotes={editingNotes} setEditingNotes={setEditingNotes} updateTransaction={updateTransaction} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredTransactions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <ArrowUpDown size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No transactions found</p>
            <p className="text-sm mt-1">Import a CSV file to get started</p>
          </div>
        )}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>{filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}{selectedTransactionIds.length > 0 && ` (${selectedTransactionIds.length} selected)`}</span>
          <span>Total: <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(filteredTransactions.reduce((sum, t) => sum + t.amount, 0))}</span></span>
        </div>
      </div>
      <CreateRuleDialog isOpen={createRuleData.isOpen} onClose={() => setCreateRuleData((d) => ({ ...d, isOpen: false }))} transactionDescription={createRuleData.description} categoryId={createRuleData.categoryId} contactId={createRuleData.contactId} />
    </>
  )
}

function ExpandedRow({ transaction, editingNotes, setEditingNotes, updateTransaction }: {
  transaction: Transaction
  editingNotes: { id: string; text: string } | null
  setEditingNotes: (val: { id: string; text: string } | null) => void
  updateTransaction: (id: string, updates: Partial<Transaction>) => void
}) {
  const isEditingNotes = editingNotes?.id === transaction.id
  return (
    <div className="grid grid-cols-3 gap-6">
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Raw Description</label>
        <p className="text-sm font-mono text-gray-600 dark:text-gray-400 break-all">{transaction.rawDescription}</p>
        <div className="mt-3 text-xs text-gray-400 space-y-1">
          <p>Imported: {new Date(transaction.importedAt).toLocaleDateString()}</p>
          <p>Updated: {new Date(transaction.updatedAt).toLocaleDateString()}</p>
          {transaction.ruleIdApplied && <p className="flex items-center gap-1"><Lightbulb size={11} className="text-amber-400" />Auto-categorized by rule</p>}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
        {isEditingNotes ? (
          <div>
            <textarea value={editingNotes!.text} onChange={(e) => setEditingNotes({ id: transaction.id, text: e.target.value })} className="input-field text-sm resize-none" rows={3} autoFocus />
            <div className="flex gap-2 mt-2">
              <button onClick={() => { updateTransaction(transaction.id, { notes: editingNotes!.text }); setEditingNotes(null) }} className="btn-primary btn-sm text-xs">Save</button>
              <button onClick={() => setEditingNotes(null)} className="btn-ghost btn-sm text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingNotes({ id: transaction.id, text: transaction.notes })} className="text-left w-full">
            {transaction.notes ? <p className="text-sm">{transaction.notes}</p> : <p className="text-sm text-gray-400 italic">Click to add notes...</p>}
          </button>
        )}
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Documents</label>
        <DocumentLinks documentIds={transaction.documentIds} />
        {transaction.splitParts && transaction.splitParts.length > 0 && (
          <div className="mt-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Split ({transaction.splitParts.length} parts)</label>
            {transaction.splitParts.map((part) => (
              <div key={part.id} className="text-xs text-gray-500 py-1">${Math.abs(part.amount).toFixed(2)} — {part.notes || 'No description'}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DocumentLinks({ documentIds }: { documentIds: string[] }) {
  const getDocument = useDocumentStore((s) => s.getDocument)
  if (documentIds.length === 0) return <p className="text-sm text-gray-400 italic">No documents attached</p>
  return (
    <div className="space-y-1">
      {documentIds.map((docId) => {
        const doc = getDocument(docId)
        const displayName = doc ? (() => { const path = doc.storedPath || doc.originalFilename; const parts = path.replace(/\\/g, '/').split('/'); return parts[parts.length - 1] || doc.originalFilename })() : docId
        return (
          <div key={docId} className="flex items-center gap-2 text-sm text-primary-600">
            <Paperclip size={12} />
            <span className="text-xs truncate">{displayName}</span>
          </div>
        )
      })}
    </div>
  )
}
