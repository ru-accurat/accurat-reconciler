import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { CategorizationRule } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface RuleState {
  rules: CategorizationRule[]
  isLoading: boolean

  setRules: (rules: CategorizationRule[]) => void
  addRule: (rule: Omit<CategorizationRule, 'id' | 'createdAt' | 'updatedAt' | 'appliedCount'>) => CategorizationRule
  updateRule: (id: string, updates: Partial<CategorizationRule>) => void
  deleteRule: (id: string) => void
  incrementAppliedCount: (id: string) => void
  matchTransaction: (description: string) => { categoryId: string; contactId: string | null; ruleId: string } | null
  save: () => Promise<void>
  load: () => Promise<void>
}

function matchesRule(description: string, rule: CategorizationRule): boolean {
  const desc = rule.caseSensitive ? description : description.toLowerCase()
  const pattern = rule.caseSensitive ? rule.pattern : rule.pattern.toLowerCase()

  switch (rule.matchType) {
    case 'exact': return desc === pattern
    case 'contains': return desc.includes(pattern)
    case 'regex':
      try {
        const flags = rule.caseSensitive ? '' : 'i'
        return new RegExp(rule.pattern, flags).test(description)
      } catch { return false }
  }
}

export const useRuleStore = create<RuleState>((set, get) => ({
  rules: [],
  isLoading: false,

  setRules: (rules) => set({ rules }),

  addRule: (ruleData) => {
    const now = new Date().toISOString()
    const rule: CategorizationRule = { ...ruleData, id: uuidv4(), appliedCount: 0, createdAt: now, updatedAt: now }
    set((state) => ({ rules: [...state.rules, rule] }))
    return rule
  },

  updateRule: (id, updates) => {
    set((state) => ({
      rules: state.rules.map((r) =>
        r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
      )
    }))
  },

  deleteRule: (id) => {
    set((state) => ({ rules: state.rules.filter((r) => r.id !== id) }))
  },

  incrementAppliedCount: (id) => {
    set((state) => ({
      rules: state.rules.map((r) =>
        r.id === id ? { ...r, appliedCount: r.appliedCount + 1 } : r
      )
    }))
  },

  matchTransaction: (description) => {
    const { rules } = get()
    const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority)
    for (const rule of sorted) {
      if (matchesRule(description, rule)) {
        return { categoryId: rule.categoryId, contactId: rule.contactId, ruleId: rule.id }
      }
    }
    return null
  },

  save: async () => {
    const { rules } = get()
    await supabase
      .from('app_data')
      .upsert({ key: 'rules', value: { version: 1, lastModified: new Date().toISOString(), rules } })
  },

  load: async () => {
    set({ isLoading: true })
    try {
      const { data } = await supabase.from('app_data').select('value').eq('key', 'rules').single()
      if (data?.value?.rules) set({ rules: data.value.rules })
    } finally {
      set({ isLoading: false })
    }
  }
}))
