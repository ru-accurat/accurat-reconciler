'use client'
import React from 'react'
import { Search, Upload } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'

export default function Header() {
  const { filters, setFilters, setShowImportDialog } = useUIStore()
  const activePage = useUIStore((s) => s.activePage)

  const searchPlaceholder = (() => {
    switch (activePage) {
      case 'documents': return 'Search documents by vendor, filename...'
      case 'contacts': return 'Search contacts by name...'
      case 'categories': return 'Search categories...'
      case 'rules': return 'Search rules...'
      default: return 'Search transactions, contacts...'
    }
  })()

  return (
    <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-6 gap-4">
      <div className="relative flex-1 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          id="global-search"
          type="text"
          placeholder={searchPlaceholder}
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
        />
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button onClick={() => setShowImportDialog(true)} className="btn-primary btn-sm flex items-center gap-2">
          <Upload size={16} />
          Import CSV
        </button>
      </div>
    </header>
  )
}
