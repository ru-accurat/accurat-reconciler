'use client'
import React, { useState } from 'react'
import { Tags, Users, Flag, CheckCircle, XCircle, X, FileSignature } from 'lucide-react'
import { useTransactionStore } from '@/stores/transactionStore'
import { useContactStore } from '@/stores/contactStore'
import { useCategoryStore } from '@/stores/categoryStore'
import { useUIStore } from '@/stores/uiStore'
import toast from 'react-hot-toast'

export default function BulkActionsBar() {
  const { selectedTransactionIds, clearSelection } = useUIStore()
  const { bulkUpdateTransactions } = useTransactionStore()
  const contacts = useContactStore((s) => s.contacts)
  const categories = useCategoryStore((s) => s.categories)

  const [showCategorySelect, setShowCategorySelect] = useState(false)
  const [showContactSelect, setShowContactSelect] = useState(false)

  const count = selectedTransactionIds.length
  if (count === 0) return null

  const topCategories = categories.filter((c) => c.parentId === null)

  const handleSetCategory = (categoryId: string) => {
    bulkUpdateTransactions(selectedTransactionIds, { categoryId })
    setShowCategorySelect(false)
    toast.success(`Category set for ${count} transactions`)
  }

  const handleSetContact = (contactId: string) => {
    bulkUpdateTransactions(selectedTransactionIds, { contactId })
    setShowContactSelect(false)
    toast.success(`Contact set for ${count} transactions`)
  }

  const handleSetStatus = (status: 'unreconciled' | 'reconciled' | 'flagged' | 'contract') => {
    bulkUpdateTransactions(selectedTransactionIds, { status })
    toast.success(`${count} transactions marked as ${status}`)
  }

  return (
    <div className="card px-4 py-2 mb-3 flex items-center gap-3 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
      <span className="text-sm font-medium text-primary-700 dark:text-primary-400">
        {count} selected
      </span>

      <div className="h-4 w-px bg-primary-200 dark:bg-primary-700" />

      <div className="relative">
        <button
          onClick={() => { setShowCategorySelect(!showCategorySelect); setShowContactSelect(false) }}
          className="btn-ghost btn-sm flex items-center gap-1.5 text-sm"
        >
          <Tags size={14} />
          Set Category
        </button>
        {showCategorySelect && (
          <div className="absolute top-full mt-1 left-0 z-50 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 max-h-60 overflow-y-auto">
            {topCategories.map((parent) => {
              const children = categories.filter((c) => c.parentId === parent.id)
              return (
                <div key={parent.id}>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase">
                    {parent.name}
                  </div>
                  {children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => handleSetCategory(child.id)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: child.color }} />
                      {child.name}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => { setShowContactSelect(!showContactSelect); setShowCategorySelect(false) }}
          className="btn-ghost btn-sm flex items-center gap-1.5 text-sm"
        >
          <Users size={14} />
          Set Contact
        </button>
        {showContactSelect && (
          <div className="absolute top-full mt-1 left-0 z-50 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 max-h-60 overflow-y-auto">
            {contacts
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSetContact(c.id)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <span className={`w-2 h-2 rounded-full ${
                    c.type === 'client' ? 'bg-emerald-500' : c.type === 'vendor' ? 'bg-blue-500' : 'bg-purple-500'
                  }`} />
                  {c.name}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-primary-200 dark:bg-primary-700" />

      <button
        onClick={() => handleSetStatus('reconciled')}
        className="btn-ghost btn-sm flex items-center gap-1.5 text-sm text-emerald-600"
      >
        <CheckCircle size={14} />
        Reconciled
      </button>
      <button
        onClick={() => handleSetStatus('flagged')}
        className="btn-ghost btn-sm flex items-center gap-1.5 text-sm text-red-600"
      >
        <Flag size={14} />
        Flag
      </button>
      <button
        onClick={() => handleSetStatus('unreconciled')}
        className="btn-ghost btn-sm flex items-center gap-1.5 text-sm text-amber-600"
      >
        <XCircle size={14} />
        Unreconcile
      </button>
      <button
        onClick={() => handleSetStatus('contract')}
        className="btn-ghost btn-sm flex items-center gap-1.5 text-sm text-indigo-600"
      >
        <FileSignature size={14} />
        Contract
      </button>

      <button onClick={clearSelection} className="ml-auto btn-ghost btn-sm text-gray-400 hover:text-gray-600">
        <X size={14} />
      </button>
    </div>
  )
}
