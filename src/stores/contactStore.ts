import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { Contact } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface ContactState {
  contacts: Contact[]
  isLoading: boolean

  setContacts: (contacts: Contact[]) => void
  addContact: (contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Contact
  updateContact: (id: string, updates: Partial<Contact>) => void
  deleteContact: (id: string) => void
  getContact: (id: string) => Contact | undefined
  findContactByPattern: (description: string) => Contact | undefined
  save: () => Promise<void>
  load: () => Promise<void>
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  isLoading: false,

  setContacts: (contacts) => set({ contacts }),

  addContact: (contactData) => {
    const now = new Date().toISOString()
    const contact: Contact = { ...contactData, id: uuidv4(), createdAt: now, updatedAt: now }
    set((state) => ({ contacts: [...state.contacts, contact] }))
    return contact
  },

  updateContact: (id, updates) => {
    set((state) => ({
      contacts: state.contacts.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
      )
    }))
  },

  deleteContact: (id) => {
    set((state) => ({ contacts: state.contacts.filter((c) => c.id !== id) }))
  },

  getContact: (id) => get().contacts.find((c) => c.id === id),

  findContactByPattern: (description) => {
    const desc = description.toUpperCase()
    return get().contacts.find((c) =>
      c.transactionPatterns.some((p) => desc.includes(p.toUpperCase()))
    )
  },

  save: async () => {
    const { contacts } = get()
    if (contacts.length === 0) return
    const rows = contacts.map((c) => ({
      id: c.id, name: c.name, legal_entity_name: c.legalEntityName ?? '',
      type: c.type, vat_tax_id: c.vatTaxId ?? '',
      address: c.address ?? '', email: c.email ?? '', phone: c.phone ?? '',
      notes: c.notes ?? '',
      transaction_patterns: c.transactionPatterns ?? [],
      source: c.source ?? 'manual',
      created_at: c.createdAt, updated_at: c.updatedAt,
    }))
    const { error } = await supabase.from('contacts').upsert(rows, { onConflict: 'id' })
    if (error) { console.error('contactStore.save failed:', error); throw error }
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data, error } = await supabase.from('contacts').select('*')
      if (error) { console.error('contactStore.load failed:', error); return }
      const contacts: Contact[] = (data ?? []).map((r: any) => ({
        id: r.id, name: r.name,
        legalEntityName: r.legal_entity_name ?? '',
        type: r.type,
        vatTaxId: r.vat_tax_id ?? '',
        address: r.address ?? '', email: r.email ?? '', phone: r.phone ?? '',
        notes: r.notes ?? '',
        transactionPatterns: Array.isArray(r.transaction_patterns) ? r.transaction_patterns : [],
        source: r.source ?? 'manual',
        createdAt: r.created_at, updatedAt: r.updated_at,
      }))
      set({ contacts })
    } finally {
      set({ isLoading: false })
    }
  }
}))
