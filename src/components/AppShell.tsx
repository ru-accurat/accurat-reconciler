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

  // Auto-rename storage objects when a doc's tag fields change.  We diff
  // prev vs next documents arrays inside a Zustand subscription; for each
  // doc whose direction/vendor/date/amount changed (or that's brand new
  // and still on its `pending/` ingest path) we move the storage file.
  // The first invocation just seeds the cache — load() runs async so we
  // don't want to trigger N renames on initial hydration.
  useEffect(() => {
    const seenSignatures = new Map<string, string>()
    let hydrated = false

    return useDocumentStore.subscribe((state) => {
      if (!hydrated) {
        for (const d of state.documents) seenSignatures.set(d.id, renameSignature(d))
        hydrated = true
        return
      }
      for (const doc of state.documents) {
        const prev = seenSignatures.get(doc.id)
        const next = renameSignature(doc)
        seenSignatures.set(doc.id, next)
        const isNew = prev === undefined
        if (!isNew && prev === next) continue
        // For new uploads we only rename once they're out of the `pending/`
        // staging folder logic — otherwise a fresh upload with no extracted
        // tags yet would race with the extraction pass that fills them.
        if (isNew && doc.storedPath.startsWith('pending/') && !doc.extractedDate && !doc.extractedVendor) continue
        renameDocumentStorageIfNeeded(doc)
          .then((patch) => {
            if (patch) useDocumentStore.getState().updateDocument(doc.id, patch)
          })
          .catch((err) => {
            // Don't toast — background firing on every edit would be noisy.
            console.error('storage rename failed:', err)
          })
      }
    })
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
    </MainLayout>
  )
}
