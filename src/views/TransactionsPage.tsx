'use client'
import React from 'react'
import { Upload } from 'lucide-react'
import TransactionTable from '@/components/transactions/TransactionTable'
import TransactionFilters from '@/components/transactions/TransactionFilters'
import BulkActionsBar from '@/components/transactions/BulkActionsBar'
import { useUIStore } from '@/stores/uiStore'

export default function TransactionsPage() {
  const setShowImportDialog = useUIStore((s) => s.setShowImportDialog)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
          <p className="text-sm text-gray-500 mt-1">View and manage all bank transactions</p>
        </div>
        <button
          onClick={() => setShowImportDialog(true)}
          className="btn-primary btn-sm flex items-center gap-2"
        >
          <Upload size={14} />
          Import CSV
        </button>
      </div>
      <TransactionFilters />
      <BulkActionsBar />
      <TransactionTable />
    </div>
  )
}
