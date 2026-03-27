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
import { useSettingsStore } from '@/stores/settingsStore'

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
      useSettingsStore.subscribe(saveAll),
    ]
    return () => unsubs.forEach((u) => u())
  }, [saveAll])

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
