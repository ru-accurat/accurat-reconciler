'use client'
import React, { useEffect, useRef, useCallback } from 'react'
import MainLayout from './layout/MainLayout'
import { useUIStore } from '@/stores/uiStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useCategoryStore } from '@/stores/categoryStore'
import { useContactStore } from '@/stores/contactStore'
import { useRuleStore } from '@/stores/ruleStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useVendorAliasStore } from '@/stores/vendorAliasStore'
import { useInvoiceTemplateStore } from '@/stores/invoiceTemplateStore'
import { useVendorExtractionRuleStore } from '@/stores/vendorExtractionRuleStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { renameDocumentStorageIfNeeded, renameSignature } from '@/lib/storage-rename'

import DashboardPage from '@/views/DashboardPage'
import TransactionsPage from '@/views/TransactionsPage'
import ContactsPage from '@/views/ContactsPage'
import CategoriesPage from '@/views/CategoriesPage'
import RulesPage from '@/views/RulesPage'
import DocumentsPage from '@/views/DocumentsPage'
import ExportPage from '@/views/ExportPage'
import SettingsPage from '@/views/SettingsPage'
import ImportCSVDialog from '@/components/transactions/ImportCSVDialog'
import CommandPalette from '@/components/CommandPalette'

export default function AppShell() {
  const activePage = useUIStore((s) => s.activePage)
  const setShowImportDialog = useUIStore((s) => s.setShowImportDialog)

  const loadedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load all data from Supabase on startup
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    async function loadAll() {
      await Promise.all([
        useTransactionStore.getState().load(),
        useCategoryStore.getState().load(),
        useContactStore.getState().load(),
        useRuleStore.getState().load(),
        useDocumentStore.getState().load(),
        useVendorAliasStore.getState().load(),
        useInvoiceTemplateStore.getState().load(),
        useVendorExtractionRuleStore.getState().load(),
        useSettingsStore.getState().load(),
      ])
      useSettingsStore.getState().applyTheme()
    }

    loadAll()
  }, [])

  // Auto-save with debounce
  const saveAll = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      await Promise.all([
        useTransactionStore.getState().save(),
        useCategoryStore.getState().save(),
        useContactStore.getState().save(),
        useRuleStore.getState().save(),
        useDocumentStore.getState().save(),
        useVendorAliasStore.getState().save(),
        useInvoiceTemplateStore.getState().save(),
        useVendorExtractionRuleStore.getState().save(),
        useSettingsStore.getState().save(),
      ])
    }, 2000)
  }, [])

  // Subscribe to store changes for auto-save
  useEffect(() => {
    const unsubs = [
      useTransactionStore.subscribe(saveAll),
      useCategoryStore.subscribe(saveAll),
      useContactStore.subscribe(saveAll),
      useRuleStore.subscribe(saveAll),
      useDocumentStore.subscribe(saveAll),
      useVendorAliasStore.subscribe(saveAll),
      useInvoiceTemplateStore.subscribe(saveAll),
      useVendorExtractionRuleStore.subscribe(saveAll),
      useSettingsStore.subscribe(saveAll),
    ]
    return () => unsubs.forEach((u) => u())
  }, [saveAll])

  // Auto-rename storage objects when a doc's tag fields change, or when
  // the matched transaction's category changes (which is part of the
  // semantic filename now).  We watch the document store, the transaction
  // store, and the category store; on each change we recompute every doc's
  // signature and fire a rename for any whose signature drifted.
  // The first invocation just seeds the cache — load() runs async so we
  // don't want to trigger N renames on initial hydration.
  useEffect(() => {
    const seenSignatures = new Map<string, string>()
    let hydrated = false

    const resolveCategoryName = (docId: string): string | null => {
      const doc = useDocumentStore.getState().documents.find((d) => d.id === docId)
      if (!doc) return null
      const txns = useTransactionStore.getState().transactions
      const cats = useCategoryStore.getState().categories
      const matched = (doc.matchedTransactionIds ?? [])
        .map((tid) => txns.find((t) => t.id === tid))
        .find((t) => t?.categoryId)
      if (!matched?.categoryId) return null
      return cats.find((c) => c.id === matched.categoryId)?.name ?? null
    }

    const reconcile = () => {
      const docs = useDocumentStore.getState().documents
      if (!hydrated) {
        for (const d of docs) {
          seenSignatures.set(d.id, renameSignature(d, { category: resolveCategoryName(d.id) }))
        }
        hydrated = true
        return
      }
      for (const doc of docs) {
        const ctx = { category: resolveCategoryName(doc.id) }
        const prev = seenSignatures.get(doc.id)
        const next = renameSignature(doc, ctx)
        seenSignatures.set(doc.id, next)
        const isNew = prev === undefined
        if (!isNew && prev === next) continue
        // Skip pending uploads until the extraction pass populates tags.
        if (isNew && doc.storedPath.startsWith('pending/') && !doc.extractedDate && !doc.extractedVendor) continue
        renameDocumentStorageIfNeeded(doc, ctx)
          .then((patch) => {
            if (patch) useDocumentStore.getState().updateDocument(doc.id, patch)
          })
          .catch((err) => {
            console.error('storage rename failed:', err)
          })
      }
    }

    const unsubs = [
      useDocumentStore.subscribe(reconcile),
      useTransactionStore.subscribe(reconcile),
      useCategoryStore.subscribe(reconcile),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault()
        setShowImportDialog(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        const input = document.getElementById('global-search') as HTMLInputElement | null
        input?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [setShowImportDialog])

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage />
      case 'transactions':
        return <TransactionsPage />
      case 'contacts':
        return <ContactsPage />
      case 'categories':
        return <CategoriesPage />
      case 'rules':
        return <RulesPage />
      case 'documents':
        return <DocumentsPage />
      case 'export':
        return <ExportPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <TransactionsPage />
    }
  }

  return (
    <MainLayout>
      {renderPage()}
      <ImportCSVDialog />
      <CommandPalette />
    </MainLayout>
  )
}
