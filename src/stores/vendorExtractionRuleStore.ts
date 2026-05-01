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
    if (rules.length === 0) return
    const rows = rules.map((r) => ({
      id: r.id,
      vendor_normalized: r.vendorNormalized,
      field: r.field,
      label: r.label,
      evidence: r.evidence,
    }))
    const { error } = await supabase
      .from('vendor_extraction_rules')
      .upsert(rows, { onConflict: 'id' })
    if (error) { console.error('vendorExtractionRuleStore.save failed:', error); throw error }
  },

  load: async () => {
    const { data, error } = await supabase.from('vendor_extraction_rules').select('*')
    if (error) { console.error('vendorExtractionRuleStore.load failed:', error); return }
    const rules = (data ?? []).map((r: any) => ({
      id: r.id,
      vendorNormalized: r.vendor_normalized,
      field: r.field,
      label: r.label,
      evidence: Array.isArray(r.evidence) ? r.evidence : [],
    }))
    set({ rules })
  },
}))
