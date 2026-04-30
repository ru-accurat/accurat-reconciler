import { create } from 'zustand'
import { VendorExtractionRule, ExtractionField, mergeRule, isRuleActive } from '@/lib/extraction-feedback'
import { supabase } from '@/lib/supabase'
import { normalizeVendor } from '@/lib/invoice-template'

interface VendorExtractionRuleState {
  rules: VendorExtractionRule[]

  setRules: (rules: VendorExtractionRule[]) => void
  addRules: (newRules: VendorExtractionRule[]) => void
  getActiveRules: (vendor: string, field: ExtractionField) => string[]
  save: () => Promise<void>
  load: () => Promise<void>
}

export const useVendorExtractionRuleStore = create<VendorExtractionRuleState>((set, get) => ({
  rules: [],

  setRules: (rules) => set({ rules }),

  addRules: (newRules) => {
    if (!newRules || newRules.length === 0) return
    set((state) => {
      let merged = state.rules
      for (const r of newRules) merged = mergeRule(merged, r)
      return { rules: merged }
    })
  },

  getActiveRules: (vendor, field) => {
    const v = normalizeVendor(vendor)
    if (!v) return []
    return get().rules
      .filter(r => r.vendorNormalized === v && r.field === field && isRuleActive(r))
      .map(r => r.label)
  },

  save: async () => {
    const { rules } = get()
    await supabase
      .from('app_data')
      .upsert({ key: 'vendorExtractionRules', value: { version: 1, lastModified: new Date().toISOString(), rules } })
  },

  load: async () => {
    const { data } = await supabase.from('app_data').select('value').eq('key', 'vendorExtractionRules').single()
    if (data?.value?.rules) set({ rules: data.value.rules })
  },
}))
