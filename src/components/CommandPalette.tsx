'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import Fuse from 'fuse.js'
import {
  LayoutDashboard, ListTree, Users, Tags, FileSpreadsheet, FileText, Cog,
  Upload, Wand2, Receipt, ArrowDownUp, Search,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useContactStore } from '@/stores/contactStore'
import { useCategoryStore } from '@/stores/categoryStore'

/**
 * Global ⌘K command palette.  Two modes:
 *   - Empty / short query: shows navigation + canned actions
 *   - Longer query: fuzzy-searches transactions / documents / contacts
 *     via Fuse.js and lets the user jump to one
 *
 * Activation: ⌘K (or Ctrl+K on non-Mac).  Escape closes.  Enter runs the
 * highlighted item.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const setActivePage      = useUIStore((s) => s.setActivePage)
  const setShowImportDialog= useUIStore((s) => s.setShowImportDialog)
  const setFilters         = useUIStore((s) => s.setFilters)

  const transactions = useTransactionStore((s) => s.transactions)
  const documents    = useDocumentStore((s) => s.documents)
  const contacts     = useContactStore((s) => s.contacts)
  const categories   = useCategoryStore((s) => s.categories)
  const contactById  = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts])

  // Toggle on ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Reset query when closed.
  useEffect(() => { if (!open) setQuery('') }, [open])

  // Fuse indexes — recreated whenever the underlying lists change.
  const txnFuse = useMemo(() => new Fuse(transactions, {
    keys: ['rawDescription', 'notes'], threshold: 0.35, minMatchCharLength: 2, includeScore: false,
  }), [transactions])
  const docFuse = useMemo(() => new Fuse(documents, {
    keys: ['originalFilename', 'extractedVendor', 'extractedInvoiceNumber'], threshold: 0.35,
  }), [documents])
  const contactFuse = useMemo(() => new Fuse(contacts, {
    keys: ['name', 'legalEntityName', 'transactionPatterns'], threshold: 0.3,
  }), [contacts])

  const matchedTxns     = query.length >= 2 ? txnFuse.search(query).slice(0, 8).map(r => r.item) : []
  const matchedDocs     = query.length >= 2 ? docFuse.search(query).slice(0, 8).map(r => r.item) : []
  const matchedContacts = query.length >= 2 ? contactFuse.search(query).slice(0, 6).map(r => r.item) : []

  const close = () => setOpen(false)
  const goTo  = (page: string) => { setActivePage(page); close() }
  const jumpToTxnSearch = (q: string) => { setActivePage('transactions'); setFilters({ search: q }); close() }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/50" onClick={close}>
      <Command
        label="Command Palette"
        className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-3 border-b border-gray-200 dark:border-gray-700">
          <Search size={16} className="text-gray-400 mr-2" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            placeholder="Type a command, or search transactions / docs / contacts…"
            className="flex-1 py-3 bg-transparent outline-none text-sm placeholder:text-gray-400"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">esc</kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto py-2">
          <Command.Empty className="py-6 text-center text-sm text-gray-500">
            No results.
          </Command.Empty>

          <Command.Group heading="Navigation" className="px-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400 [&_[cmdk-group-heading]]:py-1">
            <PaletteItem icon={LayoutDashboard} label="Dashboard"     onSelect={() => goTo('dashboard')} />
            <PaletteItem icon={ArrowDownUp}     label="Transactions"  onSelect={() => goTo('transactions')} />
            <PaletteItem icon={FileText}        label="Documents"     onSelect={() => goTo('documents')} />
            <PaletteItem icon={Users}           label="Contacts"      onSelect={() => goTo('contacts')} />
            <PaletteItem icon={Tags}            label="Categories"    onSelect={() => goTo('categories')} />
            <PaletteItem icon={ListTree}        label="Rules"         onSelect={() => goTo('rules')} />
            <PaletteItem icon={FileSpreadsheet} label="Export"        onSelect={() => goTo('export')} />
            <PaletteItem icon={Cog}             label="Settings"      onSelect={() => goTo('settings')} />
          </Command.Group>

          <Command.Group heading="Actions" className="px-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:mt-2">
            <PaletteItem icon={Upload}    label="Import bank CSV…"  shortcut="⌘I"
              onSelect={() => { setShowImportDialog(true); close() }} />
            <PaletteItem icon={Wand2}     label="Auto-match documents"
              onSelect={() => goTo('documents')} />
            <PaletteItem icon={Receipt}   label="Show only unmatched docs"
              onSelect={() => goTo('documents')} />
          </Command.Group>

          {matchedTxns.length > 0 && (
            <Command.Group heading="Transactions" className="px-2 mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400 [&_[cmdk-group-heading]]:py-1">
              {matchedTxns.map(t => {
                const cat = categories.find(c => c.id === t.categoryId)?.name ?? ''
                const con = t.contactId ? contactById.get(t.contactId)?.name ?? '' : ''
                return (
                  <PaletteItem key={t.id}
                    icon={ArrowDownUp}
                    label={t.rawDescription.slice(0, 60)}
                    sublabel={`${t.date}  ·  ${formatAmount(t.amount)}  ·  ${[con, cat].filter(Boolean).join(' / ')}`}
                    onSelect={() => jumpToTxnSearch(t.rawDescription.slice(0, 30))}
                  />
                )
              })}
            </Command.Group>
          )}

          {matchedDocs.length > 0 && (
            <Command.Group heading="Documents" className="px-2 mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400 [&_[cmdk-group-heading]]:py-1">
              {matchedDocs.map(d => (
                <PaletteItem key={d.id}
                  icon={FileText}
                  label={d.originalFilename}
                  sublabel={`${d.extractedDate ?? '?'}  ·  ${d.extractedVendor ?? '?'}  ·  ${formatAmount(d.extractedAmount ?? 0)}`}
                  onSelect={() => goTo('documents')}
                />
              ))}
            </Command.Group>
          )}

          {matchedContacts.length > 0 && (
            <Command.Group heading="Contacts" className="px-2 mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400 [&_[cmdk-group-heading]]:py-1">
              {matchedContacts.map(c => (
                <PaletteItem key={c.id}
                  icon={Users}
                  label={c.name}
                  sublabel={c.legalEntityName || c.type}
                  onSelect={() => goTo('contacts')}
                />
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  )
}

function PaletteItem({
  icon: Icon, label, sublabel, shortcut, onSelect,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  sublabel?: string
  shortcut?: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-2 py-2 rounded text-sm cursor-pointer aria-selected:bg-primary-50 dark:aria-selected:bg-primary-900/30 text-gray-800 dark:text-gray-200"
    >
      <Icon size={16} className="text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="truncate">{label}</div>
        {sublabel && <div className="text-[11px] text-gray-500 truncate">{sublabel}</div>}
      </div>
      {shortcut && <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{shortcut}</kbd>}
    </Command.Item>
  )
}

function formatAmount(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2)
}
