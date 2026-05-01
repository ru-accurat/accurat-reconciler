'use client'
import React, { useState } from 'react'
import { Download, Loader2, Clock, Archive } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransactionStore } from '@/stores/transactionStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useCategoryStore } from '@/stores/categoryStore'

const STATUS_OPTIONS: Array<{ value: 'reconciled' | 'unreconciled' | 'flagged' | 'contract' | 'tax'; label: string }> = [
  { value: 'reconciled',   label: 'Reconciled'   },
  { value: 'unreconciled', label: 'Unreconciled' },
  { value: 'flagged',      label: 'Flagged'      },
  { value: 'contract',     label: 'Contract'     },
  { value: 'tax',          label: 'Tax'          },
]

export default function ExportPage() {
  const transactions = useTransactionStore((s) => s.transactions)
  const documents    = useDocumentStore((s) => s.documents)
  const categories   = useCategoryStore((s) => s.categories)

  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [statuses, setStatuses] = useState<Set<string>>(new Set())
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [lastExport, setLastExport] = useState<string | null>(null)

  const toggle = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value); else next.add(value)
    setter(next)
  }

  const buildUrl = (): string => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to)   params.set('to',   to)
    if (statuses.size > 0)    params.set('status',      [...statuses].join(','))
    if (categoryIds.size > 0) params.set('categoryIds', [...categoryIds].join(','))
    const q = params.toString()
    return q ? `/api/export?${q}` : '/api/export'
  }

  const handleExport = async () => {
    if (transactions.length === 0) {
      toast.error('No transactions to export')
      return
    }
    setExporting(true)
    try {
      const res = await fetch(buildUrl())
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      const cd = res.headers.get('content-disposition') || ''
      const m = /filename="?([^"]+)"?/.exec(cd)
      link.download = m?.[1] ?? `reconciler-export-${new Date().toISOString().slice(0,10)}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
      setLastExport(new Date().toISOString())
      toast.success('Export downloaded')
    } catch (err) {
      console.error('Export failed:', err)
      toast.error(`Export failed: ${(err as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  const formatLastExportTime = (iso: string | null): string => {
    if (!iso) return 'Never exported'
    const d = new Date(iso)
    return `Last export: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
  }

  // Live count of what'll be in the export, given current filters.
  const filteredCount = transactions.filter(t => {
    if (from && t.date < from) return false
    if (to   && t.date > to)   return false
    if (statuses.size > 0 && !statuses.has(t.status)) return false
    if (categoryIds.size > 0 && !(t.categoryId && categoryIds.has(t.categoryId))) return false
    return true
  }).length

  // Sort categories: parents first, then their children.
  const sortedCategories = [...categories].sort((a, b) => {
    const ap = a.parentId ?? a.id
    const bp = b.parentId ?? b.id
    if (ap !== bp) return ap.localeCompare(bp)
    return (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0)
  })

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Export</h2>
        <p className="text-sm text-gray-500 mt-1">
          Download a color-coded Excel workbook plus an organized folder of every linked PDF.
        </p>
      </div>

      <div className="card p-4 mb-6 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredCount}</span>{' '}
          of {transactions.length} transactions match current filters · {documents.length} documents in storage
        </div>
        <div className="text-sm text-gray-500">
          {transactions.filter((t) => t.status === 'reconciled').length} reconciled,{' '}
          {transactions.filter((t) => t.status === 'unreconciled').length} unreconciled
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Filters</h3>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="input-field text-sm w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="input-field text-sm w-full" />
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 mb-2 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(opt => {
                  const active = statuses.has(opt.value)
                  return (
                    <button key={opt.value}
                      onClick={() => toggle(statuses, opt.value, setStatuses)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        active
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">Categories</label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {sortedCategories.map(c => {
                  const active = categoryIds.has(c.id)
                  return (
                    <button key={c.id}
                      onClick={() => toggle(categoryIds, c.id, setCategoryIds)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        active
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      } ${c.parentId ? 'ml-3' : ''}`}>
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Export contents</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-5">
              <li><strong>Reconciliation_YYYY-MM.xlsx</strong> — four sheets: Transactions, Documents, By Category, Outstanding</li>
              <li><strong>Documents/</strong> — PDFs organized by category and contact, named with date / direction / vendor / amount</li>
              <li><strong>README.txt</strong> — date range, totals, status breakdown</li>
            </ul>
          </div>
        </div>

        {/* Action column */}
        <div>
          <div className="card p-6 text-center">
            <div className="mb-3">
              {exporting
                ? <Loader2 size={32} className="mx-auto text-gray-400 animate-spin" />
                : <Archive size={32} className="mx-auto text-primary-600" />
              }
            </div>
            <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">Reconciliation Bundle</h3>
            <p className="text-sm text-gray-500 mb-4">
              Excel workbook + organized PDFs in one zip
            </p>
            <button
              onClick={handleExport}
              disabled={exporting || filteredCount === 0}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Download size={14} />
              {exporting ? 'Building bundle…' : 'Download'}
            </button>
            {lastExport && !exporting && (
              <div className="flex items-center justify-center gap-1 text-xs text-gray-400 mt-3">
                <Clock size={12} />
                {formatLastExportTime(lastExport)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
