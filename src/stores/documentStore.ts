import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { DocumentRecord } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { useTransactionStore } from '@/stores/transactionStore'

function stripNulDeep<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/ /g, '') as T
  if (Array.isArray(value)) return value.map(stripNulDeep) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = stripNulDeep(v)
    return out as T
  }
  return value
}

interface DocumentState {
  documents: DocumentRecord[]
  isLoading: boolean

  setDocuments: (documents: DocumentRecord[]) => void
  addDocument: (doc: Omit<DocumentRecord, 'id'>) => DocumentRecord
  updateDocument: (id: string, updates: Partial<DocumentRecord>) => void
  deleteDocument: (id: string) => void
  getDocument: (id: string) => DocumentRecord | undefined
  save: () => Promise<void>
  load: () => Promise<void>
}

/**
 * Backed by the `documents` table.  The `matchedTransactionIds` field is
 * persisted via the `document_transactions` junction table — written by
 * documentStore.save() (the document side owns the relationship).
 */
export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  isLoading: false,

  setDocuments: (documents) => set({ documents }),

  addDocument: (docData) => {
    const doc: DocumentRecord = { ...docData, id: uuidv4() }
    set((state) => ({ documents: [...state.documents, doc] }))
    return doc
  },

  updateDocument: (id, updates) => {
    set((state) => ({
      documents: state.documents.map((d) => (d.id === id ? { ...d, ...updates } : d))
    }))
  },

  deleteDocument: (id) => {
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }))
    // Cascade in DB happens via FK ON DELETE CASCADE; surface the row delete
    // separately so it survives auto-save debounce racing.
    supabase.from('documents').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('documentStore: row delete failed:', error)
    })
  },

  getDocument: (id) => get().documents.find((d) => d.id === id),

  save: async () => {
    const { documents } = get()
    if (documents.length === 0) return
    const sanitized = stripNulDeep(documents)
    const rows = sanitized.map((d: DocumentRecord) => ({
      id: d.id,
      original_filename: d.originalFilename,
      stored_path: d.storedPath,
      thumbnail_path: d.thumbnailPath ?? null,
      historical_paths: d.historicalPaths ?? [],
      extracted_text: d.extractedText ?? '',
      extracted_date: d.extractedDate ?? null,
      extracted_amount: d.extractedAmount ?? null,
      extracted_vendor: d.extractedVendor ?? null,
      extracted_invoice_number: d.extractedInvoiceNumber ?? null,
      extracted_billing_year: d.extractedBillingPeriod?.year ?? null,
      extracted_billing_month: d.extractedBillingPeriod?.month ?? null,
      extracted_entities: d.extractedEntities ?? null,
      direction: d.direction ?? 'incoming',
      match_confidence: d.matchConfidence ?? 0,
      match_method: d.matchMethod ?? 'auto',
      scanned_at: d.scannedAt,
    }))
    const { error: docErr } = await supabase.from('documents').upsert(rows, { onConflict: 'id' })
    if (docErr) {
      console.error('documentStore.save (rows) failed:', docErr)
      throw docErr
    }

    // Junction: rebuild for these docs only.  Delete-then-upsert pattern;
    // upsert(onConflict) is idempotent, so a concurrent save can't double-
    // insert.  We pre-filter against the in-memory transactions list so an
    // FK violation can't sink the whole save (a stale matched id from an
    // earlier session, for example, just gets dropped).
    const docIds = sanitized.map((d: DocumentRecord) => d.id)
    const { error: delErr } = await supabase
      .from('document_transactions')
      .delete()
      .in('document_id', docIds)
    if (delErr) {
      console.error('documentStore.save (junction delete) failed:', delErr)
      throw delErr
    }
    // Only insert junction rows whose txn id we can see right now in the
    // transaction store; prevents the whole save from failing on a stale ref.
    const knownTxnIds = new Set(useTransactionStore.getState().transactions.map(t => t.id))
    const seen = new Set<string>()
    const junctionRows: Array<{ document_id: string; transaction_id: string }> = []
    for (const d of sanitized as DocumentRecord[]) {
      for (const tid of d.matchedTransactionIds ?? []) {
        if (!knownTxnIds.has(tid)) continue          // FK guard
        const key = `${d.id}:${tid}`
        if (seen.has(key)) continue                   // de-dup within this batch
        seen.add(key)
        junctionRows.push({ document_id: d.id, transaction_id: tid })
      }
    }
    if (junctionRows.length > 0) {
      const { error: jErr } = await supabase
        .from('document_transactions')
        .upsert(junctionRows, { onConflict: 'document_id,transaction_id' })
      if (jErr) {
        console.error('documentStore.save (junction upsert) failed:', JSON.stringify(jErr))
        throw jErr
      }
    }
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const [{ data: rows, error }, { data: junction }] = await Promise.all([
        supabase.from('documents').select('*').order('extracted_date', { ascending: false, nullsFirst: false }),
        supabase.from('document_transactions').select('document_id, transaction_id'),
      ])
      if (error) { console.error('documentStore.load failed:', error); return }
      const txnsByDoc = new Map<string, string[]>()
      for (const j of junction ?? []) {
        const arr = txnsByDoc.get(j.document_id) ?? []
        arr.push(j.transaction_id)
        txnsByDoc.set(j.document_id, arr)
      }
      const documents: DocumentRecord[] = (rows ?? []).map((r: any) => ({
        id: r.id,
        originalFilename: r.original_filename,
        storedPath: r.stored_path,
        thumbnailPath: r.thumbnail_path ?? null,
        historicalPaths: Array.isArray(r.historical_paths) ? r.historical_paths : [],
        extractedText: r.extracted_text ?? '',
        extractedDate: r.extracted_date ?? null,
        extractedAmount: r.extracted_amount != null ? Number(r.extracted_amount) : null,
        extractedVendor: r.extracted_vendor ?? null,
        extractedInvoiceNumber: r.extracted_invoice_number ?? null,
        extractedBillingPeriod: r.extracted_billing_year != null && r.extracted_billing_month != null
          ? { year: r.extracted_billing_year, month: r.extracted_billing_month }
          : null,
        extractedEntities: r.extracted_entities ?? undefined,
        direction: r.direction ?? 'incoming',
        matchedTransactionIds: txnsByDoc.get(r.id) ?? [],
        matchConfidence: Number(r.match_confidence ?? 0),
        matchMethod: r.match_method ?? 'auto',
        scannedAt: r.scanned_at,
      }))
      set({ documents })
    } finally {
      set({ isLoading: false })
    }
  },
}))
