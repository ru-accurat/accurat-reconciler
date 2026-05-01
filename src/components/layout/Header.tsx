'use client'
import React from 'react'
import { Search, Upload, Command } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'

export default function Header() {
  const { filters, setFilters, setShowImportDialog } = useUIStore()
  const activePage = useUIStore((s) => s.activePage)

  const searchPlaceholder = (() => {
    switch (activePage) {
      case 'documents':  return 'Search documents by vendor, filename…'
      case 'contacts':   return 'Search contacts by name…'
      case 'categories': return 'Search categories…'
      case 'rules':      return 'Search rules…'
      default:           return 'Search transactions, contacts…'
    }
  })()

  return (
    <header
      className="bg-[var(--c-white)] border-b border-[var(--c-gray-200)] flex items-center px-6 gap-4"
      style={{ height: 'var(--topbar-h)' }}
    >
      <div className="relative flex-1 max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-gray-400)]" />
        <input
          id="global-search"
          type="text"
          placeholder={searchPlaceholder}
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="w-full pl-9 pr-12 py-1.5 text-[13px] bg-[var(--c-gray-50)] border border-[var(--c-gray-200)] outline-none focus:border-[var(--c-gray-900)]"
          style={{ borderRadius: 'var(--radius-md)' }}
        />
        <kbd
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] text-[var(--c-gray-500)] bg-[var(--c-white)] border border-[var(--c-gray-200)] px-1.5 py-0.5"
          style={{ borderRadius: 'var(--radius-sm)' }}
        >
          <Command size={9} /> K
        </kbd>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button onClick={() => setShowImportDialog(true)} className="btn-primary btn-sm flex items-center gap-2">
          <Upload size={14} />
          Import CSV
        </button>
      </div>
    </header>
  )
}
