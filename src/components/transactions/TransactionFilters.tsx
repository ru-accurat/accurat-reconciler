'use client'
import React, { useState } from 'react'
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useCategoryStore } from '@/stores/categoryStore'
import { useContactStore } from '@/stores/contactStore'

export default function TransactionFilters() {
  const { filters, setFilters, resetFilters } = useUIStore()
  const categories = useCategoryStore((s) => s.categories)
  const contacts = useContactStore((s) => s.contacts)
  const [expanded, setExpanded] = useState(false)

  const hasActiveFilters =
    filters.dateFrom ||
    filters.dateTo ||
    filters.status !== 'all' ||
    filters.type !== 'all' ||
    filters.amountMin ||
    filters.amountMax ||
    filters.categoryIds.length > 0 ||
    filters.contactIds.length > 0

  return (
    <div className="card mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl"
      >
        <div className="flex items-center gap-2">
          <Filter size={16} />
          <span>Filters</span>
          {hasActiveFilters && (
            <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 text-xs font-medium px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ dateFrom: e.target.value })}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ dateTo: e.target.value })}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ status: e.target.value as typeof filters.status })}
              className="input-field text-sm"
            >
              <option value="all">All</option>
              <option value="unreconciled">Unreconciled</option>
              <option value="reconciled">Reconciled</option>
              <option value="flagged">Flagged</option>
              <option value="contract">Contract</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ type: e.target.value as typeof filters.type })}
              className="input-field text-sm"
            >
              <option value="all">All</option>
              <option value="debit">Expenses</option>
              <option value="credit">Income</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Min Amount</label>
            <input
              type="number"
              placeholder="$0"
              value={filters.amountMin}
              onChange={(e) => setFilters({ amountMin: e.target.value })}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Max Amount</label>
            <input
              type="number"
              placeholder="$∞"
              value={filters.amountMax}
              onChange={(e) => setFilters({ amountMax: e.target.value })}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Category</label>
            <select
              value={filters.categoryIds[0] || ''}
              onChange={(e) =>
                setFilters({ categoryIds: e.target.value ? [e.target.value] : [] })
              }
              className="input-field text-sm"
            >
              <option value="">All Categories</option>
              {categories
                .filter((c) => c.parentId !== null)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Contact</label>
            <select
              value={filters.contactIds[0] || ''}
              onChange={(e) =>
                setFilters({ contactIds: e.target.value ? [e.target.value] : [] })
              }
              className="input-field text-sm"
            >
              <option value="">All Contacts</option>
              {contacts
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          {hasActiveFilters && (
            <div className="col-span-full flex justify-end">
              <button onClick={resetFilters} className="btn-ghost btn-sm flex items-center gap-1 text-red-600">
                <X size={14} />
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
