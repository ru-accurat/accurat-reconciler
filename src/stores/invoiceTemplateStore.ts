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
    if (templates.length === 0) return
    const rows = templates.map((t) => ({
      id: t.id,
      contact_id: t.contactId,
      signature: t.signature,
      learned_from_doc_id: t.learnedFromDocId ?? null,
      learned_at: t.learnedAt,
    }))
    const { error } = await supabase
      .from('invoice_templates')
      .upsert(rows, { onConflict: 'id' })
    if (error) { console.error('invoiceTemplateStore.save failed:', error); throw error }
  },

  load: async () => {
    const { data, error } = await supabase.from('invoice_templates').select('*')
    if (error) { console.error('invoiceTemplateStore.load failed:', error); return }
    const templates = (data ?? []).map((r: any) => ({
      id: r.id,
      contactId: r.contact_id,
      signature: r.signature,
      learnedFromDocId: r.learned_from_doc_id ?? null,
      learnedAt: r.learned_at,
    }))
    set({ templates })
  },
}))
