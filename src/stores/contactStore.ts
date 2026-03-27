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
    await supabase
      .from('app_data')
      .upsert({ key: 'contacts', value: { version: 1, lastModified: new Date().toISOString(), contacts } })
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data } = await supabase.from('app_data').select('value').eq('key', 'contacts').single()
      if (data?.value?.contacts) set({ contacts: data.value.contacts })
    } finally {
      set({ isLoading: false })
    }
  }
}))
