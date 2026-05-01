import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { InvoiceTemplate, TemplateSignature } from '@/lib/invoice-template'
import { supabase } from '@/lib/supabase'

interface InvoiceTemplateState {
  templates: InvoiceTemplate[]

  setTemplates: (templates: InvoiceTemplate[]) => void
  addTemplate: (contactId: string, signature: TemplateSignature, learnedFromDocId: string) => InvoiceTemplate | null
  removeTemplate: (id: string) => void
  removeByLearnedFromDocId: (docId: string) => void
  save: () => Promise<void>
  load: () => Promise<void>
}

export const useInvoiceTemplateStore = create<InvoiceTemplateState>((set, get) => ({
  templates: [],

  setTemplates: (templates) => set({ templates }),

  addTemplate: (contactId, signature, learnedFromDocId) => {
    if (!contactId || !learnedFromDocId) return null
    // Idempotency: never store two templates with the same source doc.
    const existing = get().templates.find(t => t.learnedFromDocId === learnedFromDocId)
    if (existing) return existing

    const tmpl: InvoiceTemplate = {
      id: uuidv4(),
      contactId,
      signature,
      learnedFromDocId,
      learnedAt: new Date().toISOString(),
    }
    set((state) => ({ templates: [...state.templates, tmpl] }))
    return tmpl
  },

  removeTemplate: (id) => {
    set((state) => ({ templates: state.templates.filter(t => t.id !== id) }))
  },

  removeByLearnedFromDocId: (docId) => {
    set((state) => ({ templates: state.templates.filter(t => t.learnedFromDocId !== docId) }))
  },

  save: async () => {
    const { templates } = get()
    await supabase
      .from('app_data')
      .upsert({ key: 'invoiceTemplates', value: { version: 1, lastModified: new Date().toISOString(), invoiceTemplates: templates } })
  },

  load: async () => {
    const { data } = await supabase.from('app_data').select('value').eq('key', 'invoiceTemplates').single()
    // Fall back to the legacy 'templates' inner key for any row that hasn't
    // been re-saved under the new schema yet (Phase 0 rename window).
    const items = data?.value?.invoiceTemplates ?? data?.value?.templates
    if (Array.isArray(items)) set({ templates: items })
  },
}))
