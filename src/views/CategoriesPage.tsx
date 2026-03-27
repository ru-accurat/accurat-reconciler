'use client'
import React, { useState } from 'react'
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useCategoryStore } from '@/stores/categoryStore'
import { useTransactionStore } from '@/stores/transactionStore'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
  '#0ea5e9', '#22c55e', '#eab308', '#d946ef', '#64748b', '#78716c'
]

interface CategoryFormData {
  name: string
  color: string
  parentId: string | null
}

export default function CategoriesPage() {
  const { categories, addCategory, updateCategory, deleteCategory } = useCategoryStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<CategoryFormData>({ name: '', color: '#3b82f6', parentId: null })
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)

  const topLevel = categories.filter((c) => c.parentId === null)

  const toggleCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openAddForm = (parentId: string | null = null) => {
    setEditingId(null)
    setFormData({ name: '', color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)], parentId })
    setShowForm(true)
  }

  const openEditForm = (id: string) => {
    const cat = categories.find((c) => c.id === id)
    if (!cat) return
    setEditingId(id)
    setFormData({ name: cat.name, color: cat.color, parentId: cat.parentId })
    setShowForm(true)
  }

  const handleSave = () => {
    if (!formData.name.trim()) { toast.error('Category name is required'); return }
    if (editingId) { updateCategory(editingId, formData); toast.success('Category updated') }
    else { addCategory({ ...formData, isDefault: false }); toast.success('Category created') }
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    const cat = categories.find((c) => c.id === id)
    if (!cat) return
    const children = categories.filter((c) => c.parentId === id)
    if (children.length > 0) { toast.error('Delete subcategories first'); return }
    const count = transactions.filter((t) => t.categoryId === id).length
    setDeleteConfirm({ id, name: `${cat.name}${count > 0 ? ` (${count} transactions will be uncategorized)` : ''}` })
  }

  const confirmDelete = () => {
    if (!deleteConfirm) return
    const { bulkUpdateTransactions } = useTransactionStore.getState()
    const affected = transactions.filter((t) => t.categoryId === deleteConfirm.id).map((t) => t.id)
    if (affected.length > 0) bulkUpdateTransactions(affected, { categoryId: null })
    deleteCategory(deleteConfirm.id)
    toast.success('Category deleted')
    setDeleteConfirm(null)
  }

  const getCategoryTransactionCount = (id: string) => transactions.filter((t) => t.categoryId === id).length

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Categories</h2>
          <p className="text-sm text-gray-500 mt-1">{categories.length} categories</p>
        </div>
        <button onClick={() => openAddForm()} className="btn-primary btn-sm flex items-center gap-2">
          <Plus size={16} />
          Add Category
        </button>
      </div>

      <div className="card overflow-hidden">
        {topLevel.map((parent) => {
          const children = categories.filter((c) => c.parentId === parent.id)
          const isCollapsed = collapsedGroups.has(parent.id)
          const groupTotal = children.reduce((sum, c) => sum + getCategoryTransactionCount(c.id), 0)
          return (
            <div key={parent.id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-3 group">
                <button onClick={() => toggleCollapse(parent.id)} className="p-0.5">
                  {isCollapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </button>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                <span className="font-semibold text-sm flex-1">{parent.name}</span>
                <span className="text-xs text-gray-400">{children.length} sub · {groupTotal} txns</span>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button onClick={() => openAddForm(parent.id)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Add subcategory"><Plus size={14} className="text-gray-500" /></button>
                  <button onClick={() => openEditForm(parent.id)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Edit"><Edit2 size={14} className="text-gray-500" /></button>
                  {!parent.isDefault && <button onClick={() => handleDelete(parent.id)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded" title="Delete"><Trash2 size={14} className="text-red-500" /></button>}
                </div>
              </div>
              {!isCollapsed && children.map((child) => {
                const count = getCategoryTransactionCount(child.id)
                return (
                  <div key={child.id} className="px-4 py-2.5 pl-12 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 group">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                    <span className="text-sm flex-1">{child.name}</span>
                    {count > 0 && <span className="text-xs text-gray-400">{count}</span>}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <button onClick={() => openEditForm(child.id)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Edit"><Edit2 size={13} className="text-gray-500" /></button>
                      {!child.isDefault && <button onClick={() => handleDelete(child.id)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded" title="Delete"><Trash2 size={13} className="text-red-500" /></button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingId ? 'Edit Category' : 'Add Category'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Name *</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field text-sm" placeholder="e.g. Office Supplies" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Parent Category</label>
            <select value={formData.parentId || ''} onChange={(e) => setFormData({ ...formData, parentId: e.target.value || null })} className="input-field text-sm">
              <option value="">None (top-level group)</option>
              {topLevel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setFormData({ ...formData, color: c })}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${formData.color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
              <input type="text" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="input-field text-sm font-mono w-28" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
            <button onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleSave} className="btn-primary btn-sm">{editingId ? 'Save Changes' : 'Add Category'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteConfirm} onConfirm={confirmDelete} onCancel={() => setDeleteConfirm(null)} title="Delete Category" message={`Are you sure you want to delete "${deleteConfirm?.name}"?`} confirmLabel="Delete" danger />
    </div>
  )
}
