'use client'
import React, { useState, useMemo, useCallback, useRef } from 'react'
import {
  FileText, File, Check, AlertCircle, Link, Unlink,
  X, Trash2, ArrowUpDown, LayoutGrid, List,
  ArrowDownCircle, ArrowUpCircle, Search, Upload, Download, Eye, Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useDocumentStore } from '@/stores/documentStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useContactStore } from '@/stores/contactStore'
import { useVendorAliasStore } from '@/stores/vendorAliasStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/ui/Modal'
import { Transaction, DocumentRecord } from '@/lib/types'

type FilterTab = 'all' | 'matched' | 'unmatched'
type SortField = 'scannedAt' | 'extractedDate' | 'extractedAmount' | 'extractedVendor' | 'matchStatus'
type ViewMode = 'list' | 'grid'

export default function DocumentsPage() {
  const documents = useDocumentStore((s) => s.documents)
  const addDocument = useDocumentStore((s) => s.addDocument)
  const updateDocument = useDocumentStore((s) => s.updateDocument)
  const deleteDocument = useDocumentStore((s) => s.deleteDocument)
  const transactions = useTransactionStore((s) => s.transactions)
  const updateTransaction = useTransactionStore((s) => s.updateTransaction)
  const contacts = useContactStore((s) => s.contacts)
  const addAlias = useVendorAliasStore((s) => s.addAlias)
  const settings = useSettingsStore((s) => s.settings)
  const globalSearch = useUIStore((s) => s.filters.search)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [showMatchDialog, setShowMatchDialog] = useState(false)
  const [matchingDocId, setMatchingDocId] = useState<string | null>(null)
  const [matchSearch, setMatchSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('scannedAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [filterDirection, setFilterDirection] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([])

  const isDocMatched = (doc: DocumentRecord): boolean => doc.matchedTransactionIds.length > 0

  const filteredDocuments = useMemo(() => {
    let result = [...documents]
    switch (filterTab) {
      case 'matched': result = result.filter(isDocMatched); break
      case 'unmatched': result = result.filter((d) => !isDocMatched(d)); break
    }
    if (filterDirection !== 'all') result = result.filter((d) => d.direction === filterDirection)
    if (globalSearch) {
      const q = globalSearch.toLowerCase()
      result = result.filter((d) =>
        d.originalFilename.toLowerCase().includes(q) ||
        (d.extractedVendor && d.extractedVendor.toLowerCase().includes(q)) ||
        (d.extractedInvoiceNumber && d.extractedInvoiceNumber.toLowerCase().includes(q)) ||
        d.storedPath.toLowerCase().includes(q)
      )
    }
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'scannedAt': cmp = (a.scannedAt || '').localeCompare(b.scannedAt || ''); break
        case 'extractedDate': cmp = (a.extractedDate || '').localeCompare(b.extractedDate || ''); break
        case 'extractedAmount': cmp = (a.extractedAmount || 0) - (b.extractedAmount || 0); break
        case 'extractedVendor': cmp = (a.extractedVendor || '').localeCompare(b.extractedVendor || ''); break
        case 'matchStatus': cmp = (isDocMatched(a) ? 1 : 0) - (isDocMatched(b) ? 1 : 0); break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return result
  }, [documents, filterTab, filterDirection, globalSearch, sortField, sortDirection])

  const counts = useMemo(() => ({
    all: documents.length,
    matched: documents.filter(isDocMatched).length,
    unmatched: documents.filter((d) => !isDocMatched(d)).length
  }), [documents])

  const getContactName = useCallback((contactId: string | null) => {
    if (!contactId) return null
    return contacts.find((c) => c.id === contactId)?.name ?? null
  }, [contacts])

  const getMatchedTransactions = useCallback((transactionIds: string[]): Transaction[] => {
    if (transactionIds.length === 0) return []
    return transactionIds.map((id) => transactions.find((t) => t.id === id)).filter((t): t is Transaction => t !== undefined)
  }, [transactions])

  const getDisplayFilename = (storedPath: string, originalFilename: string): string => {
    if (!storedPath) return originalFilename
    const parts = storedPath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || originalFilename
  }

  const getDocumentUrl = useCallback((storedPath: string): string | null => {
    if (!storedPath) return null
    const { data } = supabase.storage.from('documents').getPublicUrl(storedPath)
    return data?.publicUrl || null
  }, [])

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    let uploaded = 0
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const timestamp = Date.now()
        const storagePath = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, file, { contentType: file.type, upsert: false })

        if (uploadError) {
          toast.error(`Failed to upload ${file.name}: ${uploadError.message}`)
          continue
        }

        // Extract PDF data if applicable
        let extractedData: {
          text?: string; date?: string | null; amount?: number | null
          vendor?: string | null; invoiceNumber?: string | null
          billingPeriod?: { month: number; year: number } | null
          direction?: 'incoming' | 'outgoing'
        } = {}

        if (ext === 'pdf') {
          try {
            const formData = new FormData()
            formData.append('file', file)
            if (settings.customAmountLabels?.length > 0) {
              formData.append('customAmountLabels', JSON.stringify(settings.customAmountLabels))
            }
            const res = await fetch('/api/pdf', { method: 'POST', body: formData })
            if (res.ok) extractedData = await res.json()
          } catch {
            // PDF extraction failed — still add the document
          }
        }

        addDocument({
          originalFilename: file.name,
          storedPath: storagePath,
          extractedText: extractedData.text || '',
          extractedDate: extractedData.date || null,
          extractedAmount: extractedData.amount ?? null,
          extractedVendor: extractedData.vendor || null,
          extractedInvoiceNumber: extractedData.invoiceNumber || null,
          extractedBillingPeriod: extractedData.billingPeriod || null,
          direction: extractedData.direction || 'incoming',
          matchedTransactionIds: [],
          matchConfidence: 0,
          matchMethod: 'auto',
          scannedAt: new Date().toISOString()
        })
        uploaded++
      }
      if (uploaded > 0) toast.success(`Uploaded ${uploaded} document${uploaded > 1 ? 's' : ''}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleManualMatch = (docId: string) => {
    setMatchingDocId(docId)
    setMatchSearch('')
    setSelectedMatchIds([])
    setShowMatchDialog(true)
  }

  const toggleMatchSelection = (txnId: string) => {
    setSelectedMatchIds((prev) => prev.includes(txnId) ? prev.filter((id) => id !== txnId) : [...prev, txnId])
  }

  const handleProceedMatch = () => {
    if (!matchingDocId || selectedMatchIds.length === 0) return
    const doc = documents.find((d) => d.id === matchingDocId)
    if (!doc) return
    const existingIds = new Set(doc.matchedTransactionIds)
    const newIds = selectedMatchIds.filter((id) => !existingIds.has(id))
    const mergedIds = [...doc.matchedTransactionIds, ...newIds]
    updateDocument(matchingDocId, { matchedTransactionIds: mergedIds, matchConfidence: 1, matchMethod: 'manual' })
    for (const txnId of newIds) {
      const txn = transactions.find((t) => t.id === txnId)
      if (txn) updateTransaction(txnId, { documentIds: [...txn.documentIds, matchingDocId], status: 'reconciled' })
    }
    const firstWithContact = newIds.map((id) => transactions.find((t) => t.id === id)).find((t) => t?.contactId)
    if (doc.extractedVendor && firstWithContact?.contactId) addAlias(doc.extractedVendor, firstWithContact.contactId)
    toast.success(`Matched ${newIds.length} transaction${newIds.length > 1 ? 's' : ''} to document`)
    setShowMatchDialog(false)
    setMatchingDocId(null)
    setSelectedMatchIds([])
  }

  const handleUnlinkSingle = (docId: string, txnId: string) => {
    const doc = documents.find((d) => d.id === docId)
    const txn = transactions.find((t) => t.id === txnId)
    if (!doc || !txn) return
    const newMatchedIds = doc.matchedTransactionIds.filter((id) => id !== txnId)
    updateDocument(docId, { matchedTransactionIds: newMatchedIds, matchConfidence: newMatchedIds.length > 0 ? doc.matchConfidence : 0, matchMethod: newMatchedIds.length > 0 ? doc.matchMethod : 'auto' })
    const newDocIds = txn.documentIds.filter((id) => id !== docId)
    updateTransaction(txnId, { documentIds: newDocIds, status: newDocIds.length === 0 ? 'unreconciled' : txn.status })
    toast.success('Transaction unlinked from document')
  }

  const handleUnlink = (docId: string) => {
    const doc = documents.find((d) => d.id === docId)
    if (!doc || doc.matchedTransactionIds.length === 0) return
    for (const txnId of doc.matchedTransactionIds) {
      const txn = transactions.find((t) => t.id === txnId)
      if (txn) {
        const newDocIds = txn.documentIds.filter((id) => id !== docId)
        updateTransaction(txn.id, { documentIds: newDocIds, status: newDocIds.length === 0 ? 'unreconciled' : txn.status })
      }
    }
    updateDocument(docId, { matchedTransactionIds: [], matchConfidence: 0, matchMethod: 'auto' })
    toast.success('Document unlinked from all transactions')
  }

  const handleDeleteDocument = async (docId: string) => {
    const doc = documents.find((d) => d.id === docId)
    if (!doc) return
    for (const txnId of doc.matchedTransactionIds) {
      const txn = transactions.find((t) => t.id === txnId)
      if (txn) {
        const newDocIds = txn.documentIds.filter((id) => id !== docId)
        updateTransaction(txn.id, { documentIds: newDocIds, status: newDocIds.length === 0 ? 'unreconciled' : txn.status })
      }
    }
    // Delete from Supabase Storage if it's a storage path (not a legacy local path)
    if (doc.storedPath && !doc.storedPath.includes('/') && !doc.storedPath.startsWith('\\')) {
      await supabase.storage.from('documents').remove([doc.storedPath])
    }
    deleteDocument(docId)
    toast.success('Document removed')
  }

  const matchableTransactions = useMemo(() => {
    if (!matchSearch.trim()) return transactions.slice(0, 50)
    const search = matchSearch.toLowerCase()
    return transactions.filter((t) => t.rawDescription.toLowerCase().includes(search) || formatCurrency(t.amount).includes(search) || t.date.includes(search)).slice(0, 50)
  }, [transactions, matchSearch])

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'matched', label: 'Matched', count: counts.matched },
    { key: 'unmatched', label: 'Unmatched', count: counts.unmatched }
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Documents</h2>
          <p className="text-sm text-gray-500 mt-1">Manage invoices and receipts</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            multiple
            className="hidden"
            onChange={(e) => handleUploadFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary btn-md flex items-center gap-2"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? 'Uploading...' : 'Upload Documents'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setFilterTab(tab.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${filterTab === tab.key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {tab.label}<span className="ml-1.5 text-xs opacity-60">({tab.count})</span>
          </button>
        ))}
      </div>

      {documents.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}
              className="text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-1 focus:ring-primary-500 outline-none">
              <option value="scannedAt">Scanned Date</option>
              <option value="extractedDate">Document Date</option>
              <option value="extractedAmount">Amount</option>
              <option value="extractedVendor">Vendor</option>
              <option value="matchStatus">Match Status</option>
            </select>
            <button onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}>
              <ArrowUpDown size={14} className={sortDirection === 'asc' ? 'rotate-180' : ''} />
            </button>
          </div>
          <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(['all', 'incoming', 'outgoing'] as const).map((dir) => (
              <button key={dir} onClick={() => setFilterDirection(dir)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${filterDirection === dir ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                {dir}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 ml-auto">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500'}`} title="List view"><List size={14} /></button>
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500'}`} title="Grid view"><LayoutGrid size={14} /></button>
          </div>
        </div>
      )}

      {filteredDocuments.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          {documents.length === 0 ? (
            <>
              <p className="font-medium">No documents yet</p>
              <p className="text-sm mt-1 mb-3">Upload invoices and receipts to get started</p>
              <button onClick={() => fileInputRef.current?.click()} className="btn-primary btn-md inline-flex items-center gap-2">
                <Upload size={16} />Upload Documents
              </button>
            </>
          ) : (
            <p className="font-medium">No {filterTab === 'matched' ? 'matched' : 'unmatched'} documents</p>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocuments.map((doc) => {
            const matchedTxns = getMatchedTransactions(doc.matchedTransactionIds)
            const matched = isDocMatched(doc)
            const displayFilename = getDisplayFilename(doc.storedPath, doc.originalFilename)
            return (
              <div key={doc.id} className="card overflow-hidden hover:shadow-md transition-shadow">
                <div className="w-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center relative group" style={{ height: 120 }}>
                  <File size={48} className="text-gray-300" />
                  {getDocumentUrl(doc.storedPath) && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <a href={getDocumentUrl(doc.storedPath)!} target="_blank" rel="noopener noreferrer"
                        className="p-2 bg-white rounded-full shadow hover:bg-gray-100 transition-colors" title="View">
                        <Eye size={16} className="text-gray-700" />
                      </a>
                      <a href={getDocumentUrl(doc.storedPath)!} download={doc.originalFilename}
                        className="p-2 bg-white rounded-full shadow hover:bg-gray-100 transition-colors" title="Download">
                        <Download size={16} className="text-gray-700" />
                      </a>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate mb-1" title={displayFilename}>{displayFilename}</p>
                  <div className="flex flex-wrap items-center gap-1 mb-2">
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${doc.direction === 'incoming' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                      {doc.direction === 'incoming' ? <ArrowDownCircle size={10} /> : <ArrowUpCircle size={10} />}{doc.direction}
                    </span>
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${matched ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                      {matched ? <Check size={10} /> : <AlertCircle size={10} />}{matched ? matchedTxns.length > 1 ? `Matched (${matchedTxns.length})` : 'Matched' : 'Unmatched'}
                    </span>
                  </div>
                  {doc.extractedVendor && <p className="text-xs text-gray-500 truncate">{doc.extractedVendor}</p>}
                  {doc.extractedAmount !== null && <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(doc.extractedAmount)}</p>}
                  <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                    {matched ? (
                      <><button onClick={() => handleManualMatch(doc.id)} className="btn-secondary btn-sm text-xs flex-1" title="Add match"><Link size={12} /></button>
                      <button onClick={() => handleUnlink(doc.id)} className="btn-secondary btn-sm text-xs flex-1" title="Unlink all"><Unlink size={12} /></button></>
                    ) : (
                      <button onClick={() => handleManualMatch(doc.id)} className="btn-primary btn-sm text-xs flex-1">Match</button>
                    )}
                    <button onClick={() => handleDeleteDocument(doc.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 transition-colors" title="Remove"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => {
            const matchedTxns = getMatchedTransactions(doc.matchedTransactionIds)
            const matched = isDocMatched(doc)
            const displayFilename = getDisplayFilename(doc.storedPath, doc.originalFilename)
            return (
              <div key={doc.id} className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-lg ${matched ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <File size={20} className={matched ? 'text-emerald-600' : 'text-gray-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getDocumentUrl(doc.storedPath) ? (
                        <a href={getDocumentUrl(doc.storedPath)!} target="_blank" rel="noopener noreferrer"
                          className="font-medium text-primary-600 dark:text-primary-400 hover:underline truncate">{displayFilename}</a>
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{displayFilename}</span>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${doc.direction === 'incoming' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                        {doc.direction === 'incoming' ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}{doc.direction}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${matched ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                        {matched ? <Check size={12} /> : <AlertCircle size={12} />}{matched ? matchedTxns.length > 1 ? `Matched (${matchedTxns.length})` : 'Matched' : 'Unmatched'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                      {doc.extractedVendor && <span>Vendor: <span className="text-gray-700 dark:text-gray-300">{doc.extractedVendor}</span></span>}
                      {doc.extractedAmount !== null && <span>Amount: <span className="text-gray-700 dark:text-gray-300">{formatCurrency(doc.extractedAmount)}</span></span>}
                      {doc.extractedDate && <span>Date: <span className="text-gray-700 dark:text-gray-300">{formatDate(doc.extractedDate)}</span></span>}
                      {doc.extractedInvoiceNumber && <span>Invoice #: <span className="text-gray-700 dark:text-gray-300">{doc.extractedInvoiceNumber}</span></span>}
                      <span className="text-xs text-gray-400">Scanned {formatDate(doc.scannedAt)}</span>
                    </div>
                    {matchedTxns.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {matchedTxns.map((txn) => (
                          <div key={txn.id} className="flex items-center gap-2 text-sm bg-emerald-50 dark:bg-emerald-900/10 rounded-lg px-3 py-1.5">
                            <Link size={14} className="text-emerald-600 flex-shrink-0" />
                            <span className="text-emerald-700 dark:text-emerald-400 flex-1 truncate">
                              {txn.rawDescription.slice(0, 50)}{txn.rawDescription.length > 50 ? '...' : ''} ({formatCurrency(txn.amount)}, {formatDate(txn.date)})
                            </span>
                            {getContactName(txn.contactId) && <span className="text-emerald-600 dark:text-emerald-500 font-medium flex-shrink-0">- {getContactName(txn.contactId)}</span>}
                            <button onClick={() => handleUnlinkSingle(doc.id, txn.id)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" title="Unlink this transaction"><X size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {matched ? (
                      <><button onClick={() => handleManualMatch(doc.id)} className="btn-secondary btn-sm flex items-center gap-1.5 text-xs"><Link size={14} />Add Match</button>
                      <button onClick={() => handleUnlink(doc.id)} className="btn-secondary btn-sm flex items-center gap-1.5 text-xs"><Unlink size={14} />Unlink All</button></>
                    ) : (
                      <button onClick={() => handleManualMatch(doc.id)} className="btn-primary btn-sm flex items-center gap-1.5 text-xs"><Link size={14} />Manual Match</button>
                    )}
                    <button onClick={() => handleDeleteDocument(doc.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 transition-colors" title="Remove document"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Manual Match Dialog */}
      <Modal isOpen={showMatchDialog} onClose={() => { setShowMatchDialog(false); setMatchingDocId(null); setSelectedMatchIds([]) }} title="Match Document to Transaction" size="lg">
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search transactions by description, amount, or date..."
              value={matchSearch} onChange={(e) => setMatchSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" autoFocus />
            {matchSearch && <button onClick={() => setMatchSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {matchableTransactions.length === 0 ? (
              <p className="text-center text-gray-400 py-4 text-sm">No transactions found</p>
            ) : matchableTransactions.map((txn) => {
              const isSelected = selectedMatchIds.includes(txn.id)
              return (
                <button key={txn.id} onClick={() => toggleMatchSelection(txn.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors border ${isSelected ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-600' : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-200 dark:hover:border-gray-600'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300 dark:border-gray-600'}`}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1 mr-4">{txn.rawDescription.slice(0, 60)}{txn.rawDescription.length > 60 ? '...' : ''}</span>
                        <span className={`text-sm font-semibold flex-shrink-0 ${txn.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{txn.amount >= 0 ? '+' : '-'}{formatCurrency(txn.amount)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{formatDate(txn.date)}</span>
                        {getContactName(txn.contactId) && <span>{getContactName(txn.contactId)}</span>}
                        <span className={`px-1.5 py-0.5 rounded ${txn.status === 'reconciled' ? 'bg-emerald-100 text-emerald-700' : txn.status === 'flagged' ? 'bg-red-100 text-red-700' : txn.status === 'contract' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`}>{txn.status}</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {selectedMatchIds.length > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">{selectedMatchIds.length} transaction{selectedMatchIds.length > 1 ? 's' : ''} selected</span>
              <button onClick={handleProceedMatch} className="btn-primary btn-sm flex items-center gap-1.5"><Check size={14} />Proceed</button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
