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
    await supabase
      .from('app_data')
      .upsert({ key: 'categories', value: { version: 1, lastModified: new Date().toISOString(), categories } })
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data } = await supabase.from('app_data').select('value').eq('key', 'categories').single()
      if (data?.value?.categories) set({ categories: data.value.categories })
    } finally {
      set({ isLoading: false })
    }
  }
}))
