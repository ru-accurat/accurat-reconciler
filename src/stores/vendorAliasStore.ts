import { create } from 'zustand'
import { VendorAlias } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface VendorAliasState {
  aliases: VendorAlias[]

  setAliases: (aliases: VendorAlias[]) => void
  addAlias: (extractedVendor: string, contactId: string) => void
  removeAlias: (extractedVendor: string) => void
  findContactId: (extractedVendor: string) => string | null
  save: () => Promise<void>
  load: () => Promise<void>
}

function normalizeVendor(vendor: string): string {
  return vendor.toLowerCase().trim().replace(/\s+/g, ' ')
}

export const useVendorAliasStore = create<VendorAliasState>((set, get) => ({
  aliases: [],

  setAliases: (aliases) => set({ aliases }),

  addAlias: (extractedVendor, contactId) => {
    const key = normalizeVendor(extractedVendor)
    if (!key) return

    set((state) => {
      const existing = state.aliases.find((a) => a.extractedVendor === key)
      if (existing) {
        return {
          aliases: state.aliases.map((a) =>
            a.extractedVendor === key ? { ...a, contactId, learnedAt: new Date().toISOString() } : a
          )
        }
      }
      return {
        aliases: [...state.aliases, { extractedVendor: key, contactId, learnedAt: new Date().toISOString() }]
      }
    })
  },

  removeAlias: (extractedVendor) => {
    const key = normalizeVendor(extractedVendor)
    set((state) => ({ aliases: state.aliases.filter((a) => a.extractedVendor !== key) }))
  },

  findContactId: (extractedVendor) => {
    const key = normalizeVendor(extractedVendor)
    if (!key) return null
    return get().aliases.find((a) => a.extractedVendor === key)?.contactId ?? null
  },

  save: async () => {
    const { aliases } = get()
    if (aliases.length === 0) return
    const rows = aliases.map((a) => ({
      extracted_vendor: a.extractedVendor,
      contact_id: a.contactId,
      learned_at: a.learnedAt,
    }))
    const { error } = await supabase
      .from('vendor_aliases')
      .upsert(rows, { onConflict: 'extracted_vendor' })
    if (error) { console.error('vendorAliasStore.save failed:', error); throw error }
  },

  load: async () => {
    const { data, error } = await supabase.from('vendor_aliases').select('*')
    if (error) { console.error('vendorAliasStore.load failed:', error); return }
    const aliases = (data ?? []).map((r: any) => ({
      extractedVendor: r.extracted_vendor,
      contactId: r.contact_id,
      learnedAt: r.learned_at,
    }))
    set({ aliases })
  }
}))
