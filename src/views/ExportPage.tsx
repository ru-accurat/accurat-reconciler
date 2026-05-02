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

interface ExportFilters {
  from: string
  to: string
  statuses: Set<string>
  categoryIds: Set<string>
}

function useExportFilters(): [ExportFilters, {
  setFrom: (v: string) => void
  setTo: (v: string) => void
  toggleStatus: (v: string) => void
  toggleCategory: (v: string) => void
}] {
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [statuses,    setStatuses]    = useState<Set<string>>(new Set())
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set())

  const toggle = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value); else next.add(value)
    setter(next)
  }

  return [
    { from, to, statuses, categoryIds },
    {
      setFrom,
      setTo,
      toggleStatus:   (v) => toggle(statuses,    v, setStatuses),
      toggleCategory: (v) => toggle(categoryIds, v, setCategoryIds),
    },
  ]
}

function buildUrl(type: ExportType, filters: ExportFilters): string {
  const params = new URLSearchParams({ type })
  if (filters.from) params.set('from', filters.from)
  if (filters.to)   params.set('to',   filters.to)
  if (filters.statuses.size > 0)    params.set('status',      [...filters.statuses].join(','))
  if (filters.categoryIds.size > 0) params.set('categoryIds', [...filters.categoryIds].join(','))
  return `/api/export?${params.toString()}`
}

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

// ─── Shared filter panel ──────────────────────────────────────────────────────

interface FilterPanelProps {
  filters: ExportFilters
  actions: ReturnType<typeof useExportFilters>[1]
  sortedCategories: Array<{ id: string; name: string; parentId: string | null }>
}

function FilterPanel({ filters, actions, sortedCategories }: FilterPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
          <input type="date" value={filters.from} onChange={(e) => actions.setFrom(e.target.value)}
            className="input-field text-sm w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
          <input type="date" value={filters.to} onChange={(e) => actions.setTo(e.target.value)}
            className="input-field text-sm w-full" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 mb-2 block">Status</label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(opt => {
            const active = filters.statuses.has(opt.value)
            return (
              <button key={opt.value}
                onClick={() => actions.toggleStatus(opt.value)}
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
            const active = filters.categoryIds.has(c.id)
            return (
              <button key={c.id}
                onClick={() => actions.toggleCategory(c.id)}
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
    </div>
  )
}

// ─── Export card ─────────────────────────────────────────────────────────────

interface ExportCardProps {
  icon: React.ReactNode
  title: string
  description: string
  label: string
  exportType: ExportType
  filters: ExportFilters
  actions: ReturnType<typeof useExportFilters>[1]
  sortedCategories: Array<{ id: string; name: string; parentId: string | null }>
  filteredCount: number
  totalCount: number
  disabled?: boolean
  fallbackFilename: string
}

function ExportCard({
  icon, title, description, label,
  exportType, filters, actions, sortedCategories,
  filteredCount, totalCount, disabled, fallbackFilename,
}: ExportCardProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await triggerDownload(buildUrl(exportType, filters), fallbackFilename)
      toast.success(`${label} downloaded`)
    } catch (err) {
      console.error(`${label} export failed:`, err)
      toast.error(`Export failed: ${(err as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="mt-0.5 text-[var(--c-gray-700)]">{icon}</div>
        <div>
          <h3 className="font-semibold text-gray-900 leading-snug">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>

      <FilterPanel filters={filters} actions={actions} sortedCategories={sortedCategories} />

      <div className="mt-4 pt-4 border-t border-[var(--c-gray-100)] flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500">
          <span className="font-semibold text-gray-900">{filteredCount}</span>
          {' '}/ {totalCount} transactions
        </span>
        <button
          onClick={handleExport}
          disabled={exporting || disabled || filteredCount === 0}
          className="btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting
            ? <Loader2 size={13} className="animate-spin" />
            : <Download size={13} />
          }
          {exporting ? 'Building…' : `Download ${label}`}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const transactions = useTransactionStore((s) => s.transactions)
  const documents    = useDocumentStore((s) => s.documents)
  const categories   = useCategoryStore((s) => s.categories)

  const [csvFilters,  csvActions]  = useExportFilters()
  const [xlsxFilters, xlsxActions] = useExportFilters()
  const [zipFilters,  zipActions]  = useExportFilters()

  const datestamp = new Date().toISOString().slice(0, 10)
  const monthstamp = new Date().toISOString().slice(0, 7)

  const sortedCategories = [...categories].sort((a, b) => {
    const ap = a.parentId ?? a.id
    const bp = b.parentId ?? b.id
    if (ap !== bp) return ap.localeCompare(bp)
    return (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0)
  })

  const filtered = (filters: ExportFilters) =>
    transactions.filter(t => {
      if (filters.from && t.date < filters.from) return false
      if (filters.to   && t.date > filters.to)   return false
      if (filters.statuses.size > 0    && !filters.statuses.has(t.status))                    return false
      if (filters.categoryIds.size > 0 && !(t.categoryId && filters.categoryIds.has(t.categoryId))) return false
      return true
    }).length

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Export</h2>
        <p className="text-sm text-gray-500 mt-1">
          {transactions.length} transactions · {documents.length} documents
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CSV */}
        <ExportCard
          icon={<FileText size={20} />}
          title="Export CSV"
          description="Plain spreadsheet — one row per transaction, importable by any tool."
          label="CSV"
          exportType="csv"
          filters={csvFilters}
          actions={csvActions}
          sortedCategories={sortedCategories}
          filteredCount={filtered(csvFilters)}
          totalCount={transactions.length}
          fallbackFilename={`transactions-${datestamp}.csv`}
        />

        {/* XLSX */}
        <ExportCard
          icon={<Table2 size={20} />}
          title="Export XLSX"
          description="Color-coded Excel workbook — Transactions, Documents, By Category, Outstanding."
          label="XLSX"
          exportType="xlsx"
          filters={xlsxFilters}
          actions={xlsxActions}
          sortedCategories={sortedCategories}
          filteredCount={filtered(xlsxFilters)}
          totalCount={transactions.length}
          fallbackFilename={`Reconciliation_${monthstamp}.xlsx`}
        />

        {/* ZIP */}
        <ExportCard
          icon={<Archive size={20} />}
          title="Export Documents"
          description="Zip bundle — Excel workbook + PDFs organized by category and contact."
          label="ZIP"
          exportType="zip"
          filters={zipFilters}
          actions={zipActions}
          sortedCategories={sortedCategories}
          filteredCount={filtered(zipFilters)}
          totalCount={transactions.length}
          fallbackFilename={`reconciler-export-${datestamp}.zip`}
        />
      </div>
    </div>
  )
}
