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

function applyThemeToDocument(theme: 'light' | 'dark' | 'system'): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) root.classList.add('dark')
    else root.classList.remove('dark')
  }
  localStorage.setItem('reconciler-theme', theme)
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
    await supabase.from('app_data').upsert({ key: 'settings', value: settings })
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data } = await supabase.from('app_data').select('value').eq('key', 'settings').single()
      if (data?.value) {
        set({ settings: data.value })
        const stored = typeof localStorage !== 'undefined'
          ? localStorage.getItem('reconciler-theme') as 'light' | 'dark' | 'system' | null
          : null
        applyThemeToDocument(stored || data.value.theme)
      }
    } finally {
      set({ isLoading: false })
    }
  }
}))
