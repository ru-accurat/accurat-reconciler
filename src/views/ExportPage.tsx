'use client'
import React, { useState } from 'react'
import { Download, Check, Loader2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransactionStore } from '@/stores/transactionStore'
import { useContactStore } from '@/stores/contactStore'
import { useCategoryStore } from '@/stores/categoryStore'
import { formatDate } from '@/lib/formatters'

export default function ExportPage() {
  const transactions = useTransactionStore((s) => s.transactions)
  const contacts = useContactStore((s) => s.contacts)
  const categories = useCategoryStore((s) => s.categories)
  const [exporting, setExporting] = useState(false)
  const [lastExport, setLastExport] = useState<string | null>(null)

  const handleExport = () => {
    if (transactions.length === 0) {
      toast.error('No transactions to export')
      return
    }

    setExporting(true)

    try {
      const headers = ['Date', 'Description', 'Amount', 'Type', 'Status', 'Contact', 'Category', 'Notes', 'Billing Period']
      const rows = transactions.map((t) => {
        const contact = contacts.find((c) => c.id === t.contactId)
        const category = categories.find((c) => c.id === t.categoryId)
        const billingPeriod = t.billingPeriod ? `${t.billingPeriod.month}/${t.billingPeriod.year}` : ''
        return [
          t.date,
          `"${t.rawDescription.replace(/"/g, '""')}"`,
          t.amount.toFixed(2),
          t.type,
          t.status,
          contact?.name || '',
          category?.name || '',
          `"${(t.notes || '').replace(/"/g, '""')}"`,
          billingPeriod
        ].join(',')
      })

      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reconciler-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setLastExport(new Date().toISOString())
      toast.success('CSV exported successfully')
    } catch (err) {
      console.error('Export failed:', err)
      toast.error('Failed to export CSV')
    } finally {
      setExporting(false)
    }
  }

  const formatLastExportTime = (iso: string | null): string => {
    if (!iso) return 'Never exported'
    const d = new Date(iso)
    return `Last export: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Export</h2>
        <p className="text-sm text-gray-500 mt-1">Export transaction data</p>
      </div>

      <div className="card p-4 mb-6 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{transactions.length}</span> transactions available for export
        </div>
        <div className="text-sm text-gray-500">
          {transactions.filter((t) => t.status === 'reconciled').length} reconciled, {transactions.filter((t) => t.status === 'unreconciled').length} unreconciled
        </div>
      </div>

      <div className="max-w-md">
        <div
          className={`card p-6 text-center transition-all border-2 border-transparent hover:border-primary-300 dark:hover:border-primary-700 ${exporting ? 'opacity-70' : 'cursor-pointer'}`}
          onClick={() => !exporting && handleExport()}
        >
          <div className="mb-3">
            {exporting ? (
              <Loader2 size={32} className="mx-auto text-gray-400 animate-spin" />
            ) : (
              <Download size={32} className="mx-auto text-primary-600" />
            )}
          </div>
          <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">CSV Export</h3>
          <p className="text-sm text-gray-500 mb-3">Download transaction data as a CSV file with contacts and categories</p>
          {exporting ? (
            <p className="text-xs text-primary-600 font-medium">Exporting...</p>
          ) : lastExport ? (
            <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
              <Clock size={12} />
              {formatLastExportTime(lastExport)}
            </div>
          ) : (
            <button className="btn-primary btn-sm text-xs">Export CSV</button>
          )}
        </div>
      </div>

      <div className="card p-4 mt-6">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Export Tips</h4>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>- CSV exports include all transaction fields with resolved contact and category names</li>
          <li>- The file can be opened in Excel, Google Sheets, or any spreadsheet application</li>
          <li>- All transactions are exported regardless of current filters</li>
        </ul>
      </div>
    </div>
  )
}
