'use client'
import React, { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { useRuleStore } from '@/stores/ruleStore'
import { useContactStore } from '@/stores/contactStore'
import { useCategoryStore } from '@/stores/categoryStore'
import { suggestPattern } from '@/lib/categorization'
import toast from 'react-hot-toast'

interface CreateRuleDialogProps {
  isOpen: boolean
  onClose: () => void
  transactionDescription: string
  categoryId: string | null
  contactId: string | null
}

export default function CreateRuleDialog({
  isOpen,
  onClose,
  transactionDescription,
  categoryId,
  contactId
}: CreateRuleDialogProps) {
  const { rules, addRule } = useRuleStore()
  const contacts = useContactStore((s) => s.contacts)
  const categories = useCategoryStore((s) => s.categories)

  const [name, setName] = useState('')
  const [pattern, setPattern] = useState('')
  const [matchType, setMatchType] = useState<'exact' | 'contains' | 'regex'>('contains')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedContactId, setSelectedContactId] = useState<string>('')
  const [priority, setPriority] = useState(100)

  useEffect(() => {
    if (isOpen) {
      const suggested = suggestPattern(transactionDescription)
      setPattern(suggested)
      setName(`Match "${suggested}"`)
      setSelectedCategoryId(categoryId || '')
      setSelectedContactId(contactId || '')
      const maxPriority = rules.length > 0 ? Math.max(...rules.map((r) => r.priority)) : 0
      setPriority(maxPriority + 10)
    }
  }, [isOpen, transactionDescription, categoryId, contactId, rules])

  const testMatch = (): boolean => {
    if (!pattern) return false
    const desc = caseSensitive ? transactionDescription : transactionDescription.toLowerCase()
    const pat = caseSensitive ? pattern : pattern.toLowerCase()
    switch (matchType) {
      case 'exact':
        return desc === pat
      case 'contains':
        return desc.includes(pat)
      case 'regex':
        try {
          const flags = caseSensitive ? '' : 'i'
          return new RegExp(pattern, flags).test(transactionDescription)
        } catch {
          return false
        }
    }
  }

  const handleCreate = () => {
    if (!pattern || !selectedCategoryId) {
      toast.error('Pattern and category are required')
      return
    }

    addRule({
      name,
      priority,
      matchType,
      pattern,
      caseSensitive,
      categoryId: selectedCategoryId,
      contactId: selectedContactId || null,
      enabled: true,
      source: 'manual'
    })
    toast.success('Rule created!')
    onClose()
  }

  const topCategories = categories.filter((c) => c.parentId === null)
  const isMatch = testMatch()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Categorization Rule" size="md">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Transaction</label>
          <div className="text-sm bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-lg font-mono text-gray-600 dark:text-gray-400 truncate">
            {transactionDescription}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Rule Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field text-sm" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Pattern</label>
            <input type="text" value={pattern} onChange={(e) => setPattern(e.target.value)} className="input-field text-sm font-mono" />
          </div>
          <div className="w-28">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Match Type</label>
            <select value={matchType} onChange={(e) => setMatchType(e.target.value as 'exact' | 'contains' | 'regex')} className="input-field text-sm">
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
              <option value="regex">Regex</option>
            </select>
          </div>
        </div>
        <div className={`text-xs px-3 py-2 rounded-lg ${isMatch ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          {isMatch ? 'Pattern matches this transaction' : 'Pattern does not match this transaction'}
        </div>
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="rounded" />
            Case sensitive
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Priority</label>
            <input type="number" value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 100)} className="input-field text-sm w-20" min={1} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Category *</label>
          <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)} className="input-field text-sm">
            <option value="">Select category...</option>
            {topCategories.map((parent) => {
              const children = categories.filter((c) => c.parentId === parent.id)
              return (
                <optgroup key={parent.id} label={parent.name}>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Contact (optional)</label>
          <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} className="input-field text-sm">
            <option value="">No contact</option>
            {contacts.sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
          <button onClick={handleCreate} className="btn-primary btn-sm" disabled={!pattern || !selectedCategoryId}>Create Rule</button>
        </div>
      </div>
    </Modal>
  )
}
