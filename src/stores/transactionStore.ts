import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { Transaction, ParsedTransaction, ImportResult } from '@/lib/types'
import { supabase } from '@/lib/supabase'

/**
 * Backed by the relational `transactions` table (Phase 4 schema).  The
 * `documentIds` field on Transaction is a derived view of the
 * `document_transactions` junction — populated at load() time and kept in
 * sync via documentStore writes; transactionStore.save() does not write
 * the junction.
 *
 * save() upserts the full local set of transactions; deletes are handled
 * inline by deleteTransaction (not yet exposed to the UI but provided
 * here so future use isn't blocked).
 */

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
        updatedAt: now,
      })
    }

    set((state) => ({
      transactions: [...newTransactions, ...state.transactions].sort(
        (a, b) => b.date.localeCompare(a.date)
      ),
    }))

    return { newCount: newTransactions.length, skippedCount, newTransactions }
  },

  updateTransaction: (id, updates) => {
    set((state) => ({
      transactions: state.transactions.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      ),
    }))
  },

  bulkUpdateTransactions: (ids, updates) => {
    const idSet = new Set(ids)
    set((state) => ({
      transactions: state.transactions.map((t) =>
        idSet.has(t.id) ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      ),
    }))
  },

  getTransaction: (id) => get().transactions.find((t) => t.id === id),

  save: async () => {
    const { transactions } = get()
    if (transactions.length === 0) return
    const rows = transactions.map((t) => ({
      id: t.id, hash: t.hash, date: t.date,
      raw_description: t.rawDescription, amount: t.amount, type: t.type,
      contact_id: t.contactId, category_id: t.categoryId,
      billing_period_year: t.billingPeriod?.year ?? null,
      billing_period_month: t.billingPeriod?.month ?? null,
      billing_period_override: !!t.billingPeriodOverride,
      status: t.status,
      split_parts: t.splitParts ?? null,
      notes: t.notes ?? '',
      rule_id_applied: t.ruleIdApplied ?? null,
      imported_at: t.importedAt,
      updated_at: t.updatedAt,
    }))
    const { error } = await supabase.from('transactions').upsert(rows, { onConflict: 'id' })
    if (error) {
      console.error('transactionStore.save failed:', error)
      throw error
    }
    set({ lastSaved: new Date().toISOString() })
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const [{ data: rows, error }, { data: junction }] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('document_transactions').select('document_id, transaction_id'),
      ])
      if (error) { console.error('transactionStore.load failed:', error); return }
      const docsByTxn = new Map<string, string[]>()
      for (const j of junction ?? []) {
        const arr = docsByTxn.get(j.transaction_id) ?? []
        arr.push(j.document_id)
        docsByTxn.set(j.transaction_id, arr)
      }
      const transactions: Transaction[] = (rows ?? []).map((r: any) => ({
        id: r.id, hash: r.hash, date: r.date,
        rawDescription: r.raw_description,
        amount: Number(r.amount),
        type: r.type,
        contactId: r.contact_id,
        categoryId: r.category_id,
        billingPeriod: r.billing_period_year != null && r.billing_period_month != null
          ? { year: r.billing_period_year, month: r.billing_period_month }
          : null,
        billingPeriodOverride: !!r.billing_period_override,
        status: r.status,
        documentIds: docsByTxn.get(r.id) ?? [],
        splitParts: r.split_parts ?? null,
        notes: r.notes ?? '',
        ruleIdApplied: r.rule_id_applied ?? null,
        importedAt: r.imported_at,
        updatedAt: r.updated_at,
      }))
      set({ transactions })
    } finally {
      set({ isLoading: false })
    }
  },
}))
