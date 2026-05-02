'use client'
import React, { useState } from 'react'
import { Download, Loader2, FileText, Table2, Archive } from 'lucide-react'
import { toast } from 'sonner'
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

type ExportType = 'csv' | 'xlsx' | 'zip'

async function triggerDownload(url: string, fallbackFilename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Export failed (${res.status})`)
  const blob = await res.blob()
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadUrl
  const cd = res.headers.get('content-disposition') || ''
  const m = /filename="?([^"]+)"?/.exec(cd)
  link.download = m?.[1] ?? fallbackFilename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(downloadUrl)
}

export default function ExportPage() {
  const transactions = useTransactionStore((s) => s.transactions)
  const documents    = useDocumentStore((s) => s.documents)
  const categories   = useCategoryStore((s) => s.categories)

  // Shared filters
  const [from,        setFrom]        = useState('')
  const [to,          setTo]          = useState('')
  const [statuses,    setStatuses]    = useState<Set<string>>(new Set())
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set())

  // Per-button loading state
  const [loading, setLoading] = useState<ExportType | null>(null)

  const toggle = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value); else next.add(value)
    setter(next)
  }

  const buildUrl = (type: ExportType): string => {
    const params = new URLSearchParams({ type })
    if (from) params.set('from', from)
    if (to)   params.set('to',   to)
    if (statuses.size > 0)    params.set('status',      [...statuses].join(','))
    if (categoryIds.size > 0) params.set('categoryIds', [...categoryIds].join(','))
    return `/api/export?${params.toString()}`
  }

  const handleExport = async (type: ExportType, label: string, fallbackFilename: string) => {
    setLoading(type)
    try {
      await triggerDownload(buildUrl(type), fallbackFilename)
      toast.success(`${label} downloaded`)
    } catch (err) {
      console.error(`${label} export failed:`, err)
      toast.error(`Export failed: ${(err as Error).message}`)
    } finally {
      setLoading(null)
    }
  }

  const datestamp  = new Date().toISOString().slice(0, 10)
  const monthstamp = new Date().toISOString().slice(0, 7)

  const filteredCount = transactions.filter(t => {
    if (from && t.date < from) return false
    if (to   && t.date > to)   return false
    if (statuses.size > 0    && !statuses.has(t.status))                              return false
    if (categoryIds.size > 0 && !(t.categoryId && categoryIds.has(t.categoryId))) return false
    return true
  }).length

  const sortedCategories = [...categories].sort((a, b) => {
    const ap = a.parentId ?? a.id
    const bp = b.parentId ?? b.id
    if (ap !== bp) return ap.localeCompare(bp)
    return (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0)
  })

  const disabled = loading !== null || filteredCount === 0

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Export</h2>
        <p className="text-sm text-gray-500 mt-1">
          {transactions.length} transactions · {documents.length} documents
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Filters ── */}
        <div className="lg:col-span-2 card p-5 space-y-4 self-start">
          <h3 className="font-semibold text-gray-900">Filters</h3>

          <div className="grid grid-cols-2 gap-3">
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

          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(opt => {
                const active = statuses.has(opt.value)
                return (
                  <button key={opt.value}
                    onClick={() => toggle(statuses, opt.value, setStatuses)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      active
                        ? 'bg-[var(--c-gray-900)] text-white border-[var(--c-gray-900)]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-[var(--c-gray-100)]'
                    }`}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Categories</label>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {sortedCategories.map(c => {
                const active = categoryIds.has(c.id)
                return (
                  <button key={c.id}
                    onClick={() => toggle(categoryIds, c.id, setCategoryIds)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      active
                        ? 'bg-[var(--c-gray-900)] text-white border-[var(--c-gray-900)]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-[var(--c-gray-100)]'
                    } ${c.parentId ? 'ml-3' : ''}`}>
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-xs text-gray-500 pt-1">
            <span className="font-semibold text-gray-900">{filteredCount}</span>
            {' '}of {transactions.length} transactions match
          </p>
        </div>

        {/* ── Export buttons ── */}
        <div className="space-y-3 self-start">
          {([
            {
              type:     'csv'  as ExportType,
              icon:     <FileText size={16} />,
              label:    'Export CSV',
              desc:     'Transactions as a plain spreadsheet',
              filename: `transactions-${datestamp}.csv`,
            },
            {
              type:     'xlsx' as ExportType,
              icon:     <Table2 size={16} />,
              label:    'Export XLSX',
              desc:     'Color-coded multi-sheet workbook',
              filename: `Reconciliation_${monthstamp}.xlsx`,
            },
            {
              type:     'zip'  as ExportType,
              icon:     <Archive size={16} />,
              label:    'Export Documents',
              desc:     'Workbook + organized PDFs in a zip',
              filename: `reconciler-export-${datestamp}.zip`,
            },
          ]).map(({ type, icon, label, desc, filename }) => (
            <div key={type} className="card p-4 flex items-center gap-4">
              <div className="text-[var(--c-gray-500)] shrink-0">{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-snug">{label}</p>
                <p className="text-xs text-gray-500 truncate">{desc}</p>
              </div>
              <button
                onClick={() => handleExport(type, label, filename)}
                disabled={disabled}
                className="btn-primary btn-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === type
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Download size={13} />
                }
                {loading === type ? 'Building…' : 'Download'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
