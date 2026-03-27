'use client'
import React from 'react'
import TransactionTable from '@/components/transactions/TransactionTable'
import TransactionFilters from '@/components/transactions/TransactionFilters'
import BulkActionsBar from '@/components/transactions/BulkActionsBar'

export default function TransactionsPage() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Transactions</h2>
        <p className="text-sm text-gray-500 mt-1">View and manage all bank transactions</p>
      </div>
      <TransactionFilters />
      <BulkActionsBar />
      <TransactionTable />
    </div>
  )
}
