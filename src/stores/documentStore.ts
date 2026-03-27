import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { DocumentRecord } from '@/lib/types'
import { supabase } from '@/lib/supabase'

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

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  isLoading: false,

  setDocuments: (documents) => {
    // Migrate old matchedTransactionId to matchedTransactionIds
    const migrated = documents.map((doc: any) => {
      if ('matchedTransactionId' in doc && !('matchedTransactionIds' in doc)) {
        const { matchedTransactionId, ...rest } = doc
        return { ...rest, matchedTransactionIds: matchedTransactionId ? [matchedTransactionId] : [] }
      }
      if (!Array.isArray(doc.matchedTransactionIds)) {
        return { ...doc, matchedTransactionIds: [] }
      }
      return doc
    })
    set({ documents: migrated })
  },

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
  },

  getDocument: (id) => get().documents.find((d) => d.id === id),

  save: async () => {
    const { documents } = get()
    await supabase
      .from('app_data')
      .upsert({ key: 'documents', value: { version: 1, lastModified: new Date().toISOString(), documents } })
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data } = await supabase.from('app_data').select('value').eq('key', 'documents').single()
      if (data?.value?.documents) {
        get().setDocuments(data.value.documents)
      }
    } finally {
      set({ isLoading: false })
    }
  }
}))
