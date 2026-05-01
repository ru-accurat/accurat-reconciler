import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { Category } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface CategoryState {
  categories: Category[]
  isLoading: boolean

  setCategories: (categories: Category[]) => void
  addCategory: (category: Omit<Category, 'id'>) => Category
  updateCategory: (id: string, updates: Partial<Category>) => void
  deleteCategory: (id: string) => void
  getCategory: (id: string) => Category | undefined
  getSubcategories: (parentId: string | null) => Category[]
  save: () => Promise<void>
  load: () => Promise<void>
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  isLoading: false,

  setCategories: (categories) => set({ categories }),

  addCategory: (categoryData) => {
    const category: Category = { ...categoryData, id: uuidv4() }
    set((state) => ({ categories: [...state.categories, category] }))
    return category
  },

  updateCategory: (id, updates) => {
    set((state) => ({
      categories: state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c))
    }))
  },

  deleteCategory: (id) => {
    set((state) => ({ categories: state.categories.filter((c) => c.id !== id) }))
  },

  getCategory: (id) => get().categories.find((c) => c.id === id),

  getSubcategories: (parentId) => get().categories.filter((c) => c.parentId === parentId),

  save: async () => {
    const { categories } = get()
    if (categories.length === 0) return
    // Two-pass write because of self-referential parent_id FK.
    const roots    = categories.filter((c) => !c.parentId)
    const children = categories.filter((c) =>  c.parentId)
    const toRow = (c: Category) => ({
      id: c.id, name: c.name, color: c.color,
      parent_id: c.parentId ?? null, is_default: !!c.isDefault,
    })
    const { error: rErr } = await supabase.from('categories').upsert(roots.map(toRow), { onConflict: 'id' })
    if (rErr) { console.error('categoryStore.save (roots) failed:', rErr); throw rErr }
    if (children.length > 0) {
      const { error: cErr } = await supabase.from('categories').upsert(children.map(toRow), { onConflict: 'id' })
      if (cErr) { console.error('categoryStore.save (children) failed:', cErr); throw cErr }
    }
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data, error } = await supabase.from('categories').select('*')
      if (error) { console.error('categoryStore.load failed:', error); return }
      const categories: Category[] = (data ?? []).map((r: any) => ({
        id: r.id, name: r.name, color: r.color,
        parentId: r.parent_id ?? null, isDefault: !!r.is_default,
      }))
      set({ categories })
    } finally {
      set({ isLoading: false })
    }
  }
}))
