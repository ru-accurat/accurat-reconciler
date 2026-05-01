'use client'
import React from 'react'
import { LayoutDashboard, ArrowLeftRight, Users, FileText, Tags, ListChecks, Download, Settings, Receipt } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useTransactionStore } from '@/stores/transactionStore'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  badge?: number
}

export default function Sidebar() {
  const { activePage, setActivePage } = useUIStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const unreconciledCount = transactions.filter((t) => t.status === 'unreconciled').length

  const mainNav: NavItem[] = [
    { id: 'dashboard',    label: 'Dashboard',    icon: <LayoutDashboard size={16} /> },
    { id: 'transactions', label: 'Transactions', icon: <ArrowLeftRight size={16} />, badge: unreconciledCount || undefined },
    { id: 'contacts',     label: 'Contacts',     icon: <Users size={16} /> },
    { id: 'documents',    label: 'Documents',    icon: <FileText size={16} /> },
    { id: 'categories',   label: 'Categories',   icon: <Tags size={16} /> },
    { id: 'rules',        label: 'Rules',        icon: <ListChecks size={16} /> },
  ]

  const bottomNav: NavItem[] = [
    { id: 'export',   label: 'Export',   icon: <Download size={16} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  ]

  const renderNavItem = (item: NavItem) => {
    const active = activePage === item.id
    return (
      <button
        key={item.id}
        onClick={() => setActivePage(item.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors duration-150 ${
          active
            ? 'bg-[var(--c-gray-900)] text-[var(--c-white)]'
            : 'text-[var(--c-gray-700)] hover:bg-[var(--c-gray-100)] hover:text-[var(--c-gray-900)]'
        }`}
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <span className={active ? 'text-[var(--c-white)]' : 'text-[var(--c-gray-500)]'}>{item.icon}</span>
        <span className="flex-1 text-left">{item.label}</span>
        {item.badge && item.badge > 0 && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 ${active ? 'bg-[var(--c-white)] text-[var(--c-gray-900)]' : 'bg-[var(--c-gray-200)] text-[var(--c-gray-700)]'}`}
            style={{ borderRadius: 'var(--radius-full)' }}
          >
            {item.badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <aside
      className="flex flex-col h-full bg-[var(--c-gray-50)] border-r border-[var(--c-gray-200)]"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <div className="px-5 py-4 border-b border-[var(--c-gray-200)]">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-[var(--c-gray-900)]" />
          <h1 className="text-[15px] font-semibold tracking-tight text-[var(--c-gray-900)]">Reconciler</h1>
        </div>
        <p className="text-[11px] text-[var(--c-gray-500)] mt-0.5">Accurat USA Inc.</p>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">{mainNav.map(renderNavItem)}</nav>
      <div className="px-2 py-3 border-t border-[var(--c-gray-200)] space-y-0.5">{bottomNav.map(renderNavItem)}</div>
    </aside>
  )
}
