import { create } from 'zustand'
import { AppSettings } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface SettingsState {
  settings: AppSettings
  isLoading: boolean

  setSettings: (settings: AppSettings) => void
  updateSettings: (updates: Partial<AppSettings>) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  applyTheme: () => void
  save: () => Promise<void>
  load: () => Promise<void>
}

const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  defaultBank: 'chase',
  csvDateFormat: 'MM/DD/YYYY',
  theme: 'light',
  defaultSort: { field: 'date', direction: 'desc' },
  dateProximityDays: 7,
  businessName: '',
  businessTaxId: '',
  customAmountLabels: [],
  contractPatterns: []
}

// applyThemeToDocument is a no-op now that the app is light-only (Phase 1
// Archive parity).  Kept as a function so call-sites that still wire it up
// for future dark-mode reintroduction don't have to rebranch.
function applyThemeToDocument(_theme: 'light' | 'dark' | 'system'): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('dark')
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  isLoading: false,

  setSettings: (settings) => set({ settings }),

  updateSettings: (updates) => {
    set((state) => ({ settings: { ...state.settings, ...updates } }))
  },

  setTheme: (theme) => {
    set((state) => ({ settings: { ...state.settings, theme } }))
    applyThemeToDocument(theme)
  },

  applyTheme: () => {
    if (typeof localStorage === 'undefined') return
    const { settings } = get()
    const stored = localStorage.getItem('reconciler-theme') as 'light' | 'dark' | 'system' | null
    applyThemeToDocument(stored || settings.theme)
  },

  save: async () => {
    const { settings } = get()
    const { error } = await supabase.from('app_settings').upsert({
      id: 'main',
      version: settings.version,
      default_bank: settings.defaultBank,
      csv_date_format: settings.csvDateFormat,
      theme: settings.theme,
      default_sort_field: settings.defaultSort?.field ?? 'date',
      default_sort_dir:   settings.defaultSort?.direction ?? 'desc',
      date_proximity_days: settings.dateProximityDays,
      business_name: settings.businessName ?? '',
      business_tax_id: settings.businessTaxId ?? '',
      custom_amount_labels: settings.customAmountLabels ?? [],
      contract_patterns: settings.contractPatterns ?? [],
    }, { onConflict: 'id' })
    if (error) { console.error('settingsStore.save failed:', error); throw error }
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data, error } = await supabase
        .from('app_settings').select('*').eq('id', 'main').single()
      if (error) { console.error('settingsStore.load failed:', error); return }
      if (data) {
        const settings: AppSettings = {
          version: data.version ?? 1,
          defaultBank: data.default_bank ?? 'chase',
          csvDateFormat: data.csv_date_format ?? 'MM/DD/YYYY',
          theme: data.theme ?? 'light',
          defaultSort: { field: data.default_sort_field ?? 'date', direction: data.default_sort_dir ?? 'desc' },
          dateProximityDays: data.date_proximity_days ?? 30,
          businessName: data.business_name ?? '',
          businessTaxId: data.business_tax_id ?? '',
          customAmountLabels: Array.isArray(data.custom_amount_labels) ? data.custom_amount_labels : [],
          contractPatterns: Array.isArray(data.contract_patterns) ? data.contract_patterns : [],
        }
        set({ settings })
        const stored = typeof localStorage !== 'undefined'
          ? localStorage.getItem('reconciler-theme') as 'light' | 'dark' | 'system' | null
          : null
        applyThemeToDocument(stored || settings.theme)
      }
    } finally {
      set({ isLoading: false })
    }
  }
}))
