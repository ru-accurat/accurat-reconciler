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
    await supabase
      .from('app_data')
      .upsert({ key: 'vendorAliases', value: { version: 1, lastModified: new Date().toISOString(), aliases } })
  },

  load: async () => {
    const { data } = await supabase.from('app_data').select('value').eq('key', 'vendorAliases').single()
    if (data?.value?.aliases) {
      set({ aliases: data.value.aliases })
    }
  }
}))
