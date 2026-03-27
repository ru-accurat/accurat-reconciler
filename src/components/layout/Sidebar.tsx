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
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'transactions', label: 'Transactions', icon: <ArrowLeftRight size={20} />, badge: unreconciledCount || undefined },
    { id: 'contacts', label: 'Contacts', icon: <Users size={20} /> },
    { id: 'documents', label: 'Documents', icon: <FileText size={20} /> },
    { id: 'categories', label: 'Categories', icon: <Tags size={20} /> },
    { id: 'rules', label: 'Rules', icon: <ListChecks size={20} /> }
  ]

  const bottomNav: NavItem[] = [
    { id: 'export', label: 'Export', icon: <Download size={20} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} /> }
  ]

  const renderNavItem = (item: NavItem) => (
    <button
      key={item.id}
      onClick={() => setActivePage(item.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
        activePage === item.id ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {item.icon}
      <span className="flex-1 text-left">{item.label}</span>
      {item.badge && item.badge > 0 && (
        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
          {item.badge}
        </span>
      )}
    </button>
  )

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-full border-r border-gray-800">
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <Receipt size={24} className="text-primary-400" />
          <h1 className="text-lg font-bold tracking-tight">Reconciler</h1>
        </div>
        <p className="text-xs text-gray-500 mt-1">Accurat USA Inc.</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">{mainNav.map(renderNavItem)}</nav>
      <div className="px-3 py-4 border-t border-gray-800 space-y-1">{bottomNav.map(renderNavItem)}</div>
    </aside>
  )
}
