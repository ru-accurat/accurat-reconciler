import { create } from 'zustand'

export interface TransactionFilters {
  search: string
  dateFrom: string
  dateTo: string
  status: 'all' | 'unreconciled' | 'reconciled' | 'flagged' | 'contract'
  categoryIds: string[]
  contactIds: string[]
  amountMin: string
  amountMax: string
  type: 'all' | 'debit' | 'credit'
}

interface UIState {
  activePage: string
  filters: TransactionFilters
  showImportDialog: boolean
  showExportDialog: boolean
  showCreateRuleDialog: boolean
  selectedTransactionIds: string[]

  setActivePage: (page: string) => void
  setFilters: (filters: Partial<TransactionFilters>) => void
  resetFilters: () => void
  setShowImportDialog: (show: boolean) => void
  setShowExportDialog: (show: boolean) => void
  setShowCreateRuleDialog: (show: boolean) => void
  setSelectedTransactionIds: (ids: string[]) => void
  toggleTransactionSelection: (id: string) => void
  selectAllTransactions: (ids: string[]) => void
  clearSelection: () => void
}

const DEFAULT_FILTERS: TransactionFilters = {
  search: '',
  dateFrom: '',
  dateTo: '',
  status: 'all',
  categoryIds: [],
  contactIds: [],
  amountMin: '',
  amountMax: '',
  type: 'all'
}

export const useUIStore = create<UIState>((set) => ({
  activePage: 'transactions',
  filters: { ...DEFAULT_FILTERS },
  showImportDialog: false,
  showExportDialog: false,
  showCreateRuleDialog: false,
  selectedTransactionIds: [],

  setActivePage: (page) => set({ activePage: page }),
  setFilters: (updates) => set((state) => ({ filters: { ...state.filters, ...updates } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
  setShowImportDialog: (show) => set({ showImportDialog: show }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowCreateRuleDialog: (show) => set({ showCreateRuleDialog: show }),
  setSelectedTransactionIds: (ids) => set({ selectedTransactionIds: ids }),
  toggleTransactionSelection: (id) =>
    set((state) => ({
      selectedTransactionIds: state.selectedTransactionIds.includes(id)
        ? state.selectedTransactionIds.filter((i) => i !== id)
        : [...state.selectedTransactionIds, id]
    })),
  selectAllTransactions: (ids) => set({ selectedTransactionIds: ids }),
  clearSelection: () => set({ selectedTransactionIds: [] })
}))
