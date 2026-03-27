import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { Transaction, ParsedTransaction, ImportResult } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface TransactionState {
  transactions: Transaction[]
  isLoading: boolean
  lastSaved: string | null

  setTransactions: (transactions: Transaction[]) => void
  importTransactions: (parsed: ParsedTransaction[], existingHashes: Set<string>) => ImportResult
  updateTransaction: (id: string, updates: Partial<Transaction>) => void
  bulkUpdateTransactions: (ids: string[], updates: Partial<Transaction>) => void
  getTransaction: (id: string) => Transaction | undefined
  save: () => Promise<void>
  load: () => Promise<void>
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  isLoading: false,
  lastSaved: null,

  setTransactions: (transactions) => set({ transactions }),

  importTransactions: (parsed, existingHashes) => {
    const now = new Date().toISOString()
    const newTransactions: Transaction[] = []
    let skippedCount = 0

    for (const p of parsed) {
      if (existingHashes.has(p.hash)) {
        skippedCount++
        continue
      }

      newTransactions.push({
        id: uuidv4(),
        hash: p.hash,
        date: p.date,
        rawDescription: p.rawDescription,
        amount: p.amount,
        type: p.type,
        contactId: null,
        categoryId: null,
        billingPeriod: null,
        billingPeriodOverride: false,
        status: 'unreconciled',
        documentIds: [],
        splitParts: null,
        notes: '',
        ruleIdApplied: null,
        importedAt: now,
        updatedAt: now
      })
    }

    set((state) => ({
      transactions: [...newTransactions, ...state.transactions].sort(
        (a, b) => b.date.localeCompare(a.date)
      )
    }))

    return {
      newCount: newTransactions.length,
      skippedCount,
      newTransactions
    }
  },

  updateTransaction: (id, updates) => {
    set((state) => ({
      transactions: state.transactions.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      )
    }))
  },

  bulkUpdateTransactions: (ids, updates) => {
    const idSet = new Set(ids)
    set((state) => ({
      transactions: state.transactions.map((t) =>
        idSet.has(t.id) ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      )
    }))
  },

  getTransaction: (id) => {
    return get().transactions.find((t) => t.id === id)
  },

  save: async () => {
    const { transactions } = get()
    const { error } = await supabase
      .from('app_data')
      .upsert({ key: 'transactions', value: { version: 1, lastModified: new Date().toISOString(), transactions } })
    if (error) console.error('Failed to save transactions:', error)
    else set({ lastSaved: new Date().toISOString() })
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data, error } = await supabase
        .from('app_data')
        .select('value')
        .eq('key', 'transactions')
        .single()
      if (data?.value?.transactions) {
        set({ transactions: data.value.transactions })
      }
    } finally {
      set({ isLoading: false })
    }
  }
}))
