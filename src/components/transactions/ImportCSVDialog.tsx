'use client'
import React, { useState, useRef } from 'react'
import { Upload, X, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransactionStore } from '@/stores/transactionStore'
import { useRuleStore } from '@/stores/ruleStore'
import { useUIStore } from '@/stores/uiStore'
import { applyRulesToTransactions, applyContractPatterns } from '@/lib/categorization'
import { useCategoryStore } from '@/stores/categoryStore'
import { useContactStore } from '@/stores/contactStore'
import { useSettingsStore } from '@/stores/settingsStore'

interface ImportState {
  status: 'idle' | 'parsing' | 'done' | 'error'
  fileName: string | null
  newCount: number
  skippedCount: number
  error: string | null
}

export default function ImportCSVDialog() {
  const { showImportDialog, setShowImportDialog } = useUIStore()
  const { transactions, importTransactions, setTransactions, save } = useTransactionStore()
  const rules = useRuleStore((s) => s.rules)
  const categories = useCategoryStore((s) => s.categories)
  const contacts = useContactStore((s) => s.contacts)
  const contractPatterns = useSettingsStore((s) => s.settings.contractPatterns)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<ImportState>({
    status: 'idle',
    fileName: null,
    newCount: 0,
    skippedCount: 0,
    error: null
  })

  if (!showImportDialog) return null

  const handleFileSelect = async (file: File) => {
    setState({ status: 'parsing', fileName: file.name, newCount: 0, skippedCount: 0, error: null })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/csv', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to parse CSV')
      }

      const { transactions: parsed } = await response.json()

      // Get existing hashes for dedup
      const existingHashes = new Set(transactions.map((t) => t.hash))

      // Import with dedup
      const result = importTransactions(parsed, existingHashes)

      // Auto-categorize new transactions using rules, then apply contract patterns
      if (result.newCount > 0) {
        const allTransactions = useTransactionStore.getState().transactions
        const categorized = applyRulesToTransactions(allTransactions, rules, contacts)
        const withContracts = applyContractPatterns(categorized, contractPatterns || [])
        setTransactions(withContracts)
      }

      // Auto-save
      await save()

      setState({
        status: 'done',
        fileName: file.name,
        newCount: result.newCount,
        skippedCount: result.skippedCount,
        error: null
      })

      if (result.newCount > 0) {
        toast.success(`Imported ${result.newCount} new transaction${result.newCount !== 1 ? 's' : ''}`)
      } else {
        toast(`No new transactions found (${result.skippedCount} duplicates skipped)`, { icon: 'i' })
      }
    } catch (err) {
      setState({
        status: 'error',
        fileName: null,
        newCount: 0,
        skippedCount: 0,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
      toast.error('Failed to import CSV')
    }
  }

  const handleSelectFile = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
    // Reset the input so the same file can be selected again
    e.target.value = ''
  }

  const handleClose = () => {
    setState({ status: 'idle', fileName: null, newCount: 0, skippedCount: 0, error: null })
    setShowImportDialog(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Import Bank CSV</h2>
          <button onClick={handleClose} className="btn-ghost p-1 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {state.status === 'idle' ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center">
                <FileSpreadsheet size={32} className="text-primary-600" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Select a Chase bank statement CSV file to import. Duplicate transactions will be
                automatically skipped.
              </p>
              <button
                onClick={handleSelectFile}
                className="btn-primary flex items-center gap-2 mx-auto"
              >
                <Upload size={18} />
                Select CSV File
              </button>
            </div>
          ) : state.status === 'parsing' ? (
            <div className="text-center py-4">
              <div className="animate-spin w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-sm text-gray-600">Parsing and importing...</p>
            </div>
          ) : state.status === 'done' ? (
            <div className="text-center">
              <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Import Complete</h3>
              <div className="space-y-2 text-sm">
                <p className="text-emerald-600">
                  <span className="font-bold">{state.newCount}</span> new transaction
                  {state.newCount !== 1 ? 's' : ''} imported
                </p>
                {state.skippedCount > 0 && (
                  <p className="text-gray-500">
                    {state.skippedCount} duplicate{state.skippedCount !== 1 ? 's' : ''} skipped
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Import Failed</h3>
              <p className="text-sm text-red-600">{state.error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          {state.status === 'done' || state.status === 'error' ? (
            <>
              <button onClick={handleSelectFile} className="btn-secondary btn-sm">
                Import Another
              </button>
              <button onClick={handleClose} className="btn-primary btn-sm">
                Done
              </button>
            </>
          ) : (
            <button onClick={handleClose} className="btn-secondary btn-sm">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
