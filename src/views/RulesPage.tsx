'use client'

import React, { useState, useMemo } from 'react'
import {
  Search, Plus, Edit2, Trash2, X, Save, Zap, Play, AlertCircle,
  CheckCircle2, ToggleLeft, ToggleRight, ArrowUpDown, Copy, Hash
} from 'lucide-react'
import toast from 'react-hot-toast'
import { CategorizationRule } from '@/lib/types'
import { useRuleStore } from '@/stores/ruleStore'
import { useContactStore } from '@/stores/contactStore'
import { useCategoryStore } from '@/stores/categoryStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { applyRulesToTransactions } from '@/lib/categorization'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

type MatchType = CategorizationRule['matchType']

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  exact: 'Exact Match',
  contains: 'Contains',
  regex: 'Regex'
}

const MATCH_TYPE_COLORS: Record<MatchType, string> = {
  exact: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  contains: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  regex: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
}

interface RuleForm {
  name: string
  priority: number
  matchType: MatchType
  pattern: string
  caseSensitive: boolean
  categoryId: string
  contactId: string | null
  enabled: boolean
  source: 'manual' | 'suggested'
}

const emptyForm: RuleForm = {
  name: '',
  priority: 100,
  matchType: 'contains',
  pattern: '',
  caseSensitive: false,
  categoryId: '',
  contactId: null,
  enabled: true,
  source: 'manual'
}

export default function RulesPage() {
  const { rules, addRule, updateRule, deleteRule, save } = useRuleStore()
  const contacts = useContactStore((s) => s.contacts)
  const categories = useCategoryStore((s) => s.categories)
  const { transactions, updateTransaction } = useTransactionStore()
  const saveTransactions = useTransactionStore((s) => s.save)
  const matchTransaction = useRuleStore((s) => s.matchTransaction)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterMatchType, setFilterMatchType] = useState<MatchType | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RuleForm>({ ...emptyForm })
  const [testInput, setTestInput] = useState('')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<CategorizationRule | null>(null)
  const [sortField, setSortField] = useState<'name' | 'priority' | 'appliedCount'>('priority')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [applyingAll, setApplyingAll] = useState(false)

  const filteredRules = useMemo(() => {
    let result = rules.filter((r) => {
      const matchesSearch = !searchQuery ||
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.pattern.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = filterMatchType === 'all' || r.matchType === filterMatchType
      return matchesSearch && matchesType
    })

    result.sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortField === 'priority') cmp = a.priority - b.priority
      else if (sortField === 'appliedCount') cmp = a.appliedCount - b.appliedCount
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [rules, searchQuery, filterMatchType, sortField, sortDir])

  const getCategoryName = (id: string) => categories.find((c) => c.id === id)?.name || 'Unknown'
  const getContactName = (id: string | null) => {
    if (!id) return null
    return contacts.find((c) => c.id === id)?.name || 'Unknown'
  }

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const openCreate = () => {
    setForm({ ...emptyForm })
    setTestInput('')
    setTestResult(null)
    setIsEditing(false)
    setEditingId(null)
    setShowModal(true)
  }

  const openEdit = (rule: CategorizationRule) => {
    setForm({
      name: rule.name,
      priority: rule.priority,
      matchType: rule.matchType,
      pattern: rule.pattern,
      caseSensitive: rule.caseSensitive,
      categoryId: rule.categoryId,
      contactId: rule.contactId,
      enabled: rule.enabled,
      source: rule.source
    })
    setTestInput('')
    setTestResult(null)
    setEditingId(rule.id)
    setIsEditing(true)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Rule name is required'); return }
    if (!form.pattern.trim()) { toast.error('Pattern is required'); return }
    if (!form.categoryId) { toast.error('Category is required'); return }

    // Validate regex
    if (form.matchType === 'regex') {
      try {
        new RegExp(form.pattern)
      } catch {
        toast.error('Invalid regex pattern')
        return
      }
    }

    try {
      if (isEditing && editingId) {
        updateRule(editingId, form)
        toast.success('Rule updated')
      } else {
        addRule(form)
        toast.success('Rule created')
      }
      await save()
      setShowModal(false)
    } catch (err) {
      console.error('Failed to save rule:', err)
      toast.error('Failed to save rule')
    }
  }

  const handleToggleEnabled = async (rule: CategorizationRule) => {
    updateRule(rule.id, { enabled: !rule.enabled })
    await save()
    toast.success(rule.enabled ? 'Rule disabled' : 'Rule enabled')
  }

  const handleDeleteClick = (rule: CategorizationRule) => {
    setRuleToDelete(rule)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!ruleToDelete) return
    try {
      deleteRule(ruleToDelete.id)
      await save()
      toast.success('Rule deleted')
    } catch (err) {
      console.error('Failed to delete rule:', err)
      toast.error('Failed to delete rule')
    }
    setDeleteDialogOpen(false)
    setRuleToDelete(null)
  }

  const handleTest = () => {
    if (!testInput.trim()) { setTestResult(null); return }
    const match = matchTransaction(testInput)
    if (match) {
      const cat = getCategoryName(match.categoryId)
      const contact = getContactName(match.contactId)
      setTestResult(`Match! Category: ${cat}${contact ? `, Contact: ${contact}` : ''}`)
    } else {
      setTestResult('No match')
    }
  }

  const handleApplyAll = async () => {
    setApplyingAll(true)
    try {
      let applied = 0
      const uncategorized = transactions.filter((t) => !t.categoryId && !t.ruleIdApplied)

      for (const t of uncategorized) {
        const match = matchTransaction(t.rawDescription)
        if (match) {
          updateTransaction(t.id, {
            categoryId: match.categoryId,
            contactId: match.contactId || t.contactId,
            ruleIdApplied: match.ruleId
          })
          applied++
        }
      }

      if (applied > 0) {
        await saveTransactions()
        toast.success(`Applied rules to ${applied} transactions`)
      } else {
        toast.success('No uncategorized transactions matched any rules')
      }
    } catch (err) {
      console.error('Failed to apply rules:', err)
      toast.error('Failed to apply rules')
    } finally {
      setApplyingAll(false)
    }
  }

  const duplicateRule = (rule: CategorizationRule) => {
    setForm({
      name: `${rule.name} (copy)`,
      priority: rule.priority,
      matchType: rule.matchType,
      pattern: rule.pattern,
      caseSensitive: rule.caseSensitive,
      categoryId: rule.categoryId,
      contactId: rule.contactId,
      enabled: rule.enabled,
      source: 'manual'
    })
    setTestInput('')
    setTestResult(null)
    setIsEditing(false)
    setEditingId(null)
    setShowModal(true)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Categorization Rules</h2>
          <p className="text-sm text-gray-500 mt-1">Automatically categorize transactions based on patterns</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleApplyAll}
            disabled={applyingAll}
            className="btn-secondary flex items-center gap-2"
          >
            <Play size={16} />
            {applyingAll ? 'Applying...' : 'Apply All Rules'}
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            New Rule
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{rules.length}</p>
          <p className="text-xs text-gray-500">Total Rules</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{rules.filter((r) => r.enabled).length}</p>
          <p className="text-xs text-gray-500">Active</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-gray-400">{rules.filter((r) => !r.enabled).length}</p>
          <p className="text-xs text-gray-500">Disabled</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-primary-600">{rules.reduce((sum, r) => sum + r.appliedCount, 0)}</p>
          <p className="text-xs text-gray-500">Total Applied</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rules..."
            className="input-field text-sm pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'contains', 'exact', 'regex'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterMatchType(type)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                filterMatchType === type
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {type === 'all' ? 'All' : MATCH_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Rules Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">
                <button onClick={() => handleSort('priority')} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
                  <Hash size={12} /> Priority <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">
                <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
                  Name <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Pattern</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Contact</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">
                <button onClick={() => handleSort('appliedCount')} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
                  Applied <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  <Zap size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No rules found</p>
                </td>
              </tr>
            ) : (
              filteredRules.map((rule) => (
                <tr key={rule.id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${!rule.enabled ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{rule.priority}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{rule.name}</span>
                    {rule.source === 'suggested' && (
                      <span className="ml-1.5 text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">suggested</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${MATCH_TYPE_COLORS[rule.matchType]}`}>
                      {MATCH_TYPE_LABELS[rule.matchType]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300 max-w-[200px] truncate inline-block">
                      {rule.pattern}
                    </code>
                    {rule.caseSensitive && <span className="ml-1 text-xs text-gray-400" title="Case sensitive">Aa</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{getCategoryName(rule.categoryId)}</td>
                  <td className="px-4 py-3 text-gray-500">{getContactName(rule.contactId) || '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{rule.appliedCount}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggleEnabled(rule)} title={rule.enabled ? 'Disable' : 'Enable'}>
                      {rule.enabled ? (
                        <ToggleRight size={20} className="text-green-600" />
                      ) : (
                        <ToggleLeft size={20} className="text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(rule)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => duplicateRule(rule)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600" title="Duplicate">
                        <Copy size={14} />
                      </button>
                      <button onClick={() => handleDeleteClick(rule)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-gray-400 hover:text-red-500" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditing ? 'Edit Rule' : 'New Rule'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field text-sm"
                placeholder="Rule name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 100 })}
                className="input-field text-sm"
                min={1}
              />
              <p className="text-xs text-gray-400 mt-0.5">Lower = higher priority</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Match Type</label>
              <select
                value={form.matchType}
                onChange={(e) => setForm({ ...form, matchType: e.target.value as MatchType })}
                className="input-field text-sm"
              >
                <option value="contains">Contains</option>
                <option value="exact">Exact Match</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.caseSensitive}
                  onChange={(e) => setForm({ ...form, caseSensitive: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Case sensitive</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pattern *</label>
            <input
              type="text"
              value={form.pattern}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              className="input-field text-sm font-mono"
              placeholder={form.matchType === 'regex' ? 'e.g. AMAZON.*MARKETPLACE' : 'e.g. AMAZON'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="input-field text-sm"
            >
              <option value="">Select category...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact (optional)</label>
            <select
              value={form.contactId || ''}
              onChange={(e) => setForm({ ...form, contactId: e.target.value || null })}
              className="input-field text-sm"
            >
              <option value="">No contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Test Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Pattern</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testInput}
                onChange={(e) => { setTestInput(e.target.value); setTestResult(null) }}
                className="input-field text-sm flex-1 font-mono"
                placeholder="Enter a transaction description to test..."
              />
              <button onClick={handleTest} className="btn-secondary btn-sm flex items-center gap-1">
                <Play size={14} />
                Test
              </button>
            </div>
            {testResult && (
              <div className={`mt-2 flex items-center gap-2 text-sm ${testResult.startsWith('Match') ? 'text-green-600' : 'text-gray-400'}`}>
                {testResult.startsWith('Match') ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {testResult}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary flex items-center gap-1">
              <Save size={14} />
              {isEditing ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Delete Rule"
        message={`Are you sure you want to delete "${ruleToDelete?.name}"? This will not affect previously categorized transactions.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteDialogOpen(false); setRuleToDelete(null) }}
      />
    </div>
  )
}
