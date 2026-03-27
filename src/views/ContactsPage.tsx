'use client'

import React, { useState, useMemo } from 'react'
import {
  Search, Plus, Edit2, Trash2, X, Save, Users, Building2, ChevronRight,
  Mail, Phone, MapPin, FileText, Tag, ArrowUpDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Contact } from '@/lib/types'
import { useContactStore } from '@/stores/contactStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useRuleStore } from '@/stores/ruleStore'
import { useUIStore } from '@/stores/uiStore'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatCurrency, formatDate } from '@/lib/formatters'

type ContactType = Contact['type']

const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  vendor: 'Vendor',
  client: 'Client',
  service: 'Service'
}

const CONTACT_TYPE_COLORS: Record<ContactType, string> = {
  vendor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  client: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  service: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
}

const emptyContact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  legalEntityName: '',
  type: 'vendor',
  vatTaxId: '',
  address: '',
  email: '',
  phone: '',
  notes: '',
  transactionPatterns: [],
  source: 'manual'
}

export default function ContactsPage() {
  const { contacts, addContact, updateContact, deleteContact, save } = useContactStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const rules = useRuleStore((s) => s.rules)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<ContactType | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [editForm, setEditForm] = useState<Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>>(emptyContact)
  const [newPattern, setNewPattern] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null)
  const [sortField, setSortField] = useState<'name' | 'type' | 'transactions'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Count transactions per contact
  const transactionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of transactions) {
      if (t.contactId) {
        counts[t.contactId] = (counts[t.contactId] || 0) + 1
      }
    }
    return counts
  }, [transactions])

  // Transaction totals per contact
  const transactionTotals = useMemo(() => {
    const totals: Record<string, { income: number; expense: number }> = {}
    for (const t of transactions) {
      if (t.contactId) {
        if (!totals[t.contactId]) totals[t.contactId] = { income: 0, expense: 0 }
        if (t.amount > 0) totals[t.contactId].income += t.amount
        else totals[t.contactId].expense += Math.abs(t.amount)
      }
    }
    return totals
  }, [transactions])

  // Filtered and sorted contacts
  const filteredContacts = useMemo(() => {
    let result = contacts.filter((c) => {
      const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.legalEntityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = filterType === 'all' || c.type === filterType
      return matchesSearch && matchesType
    })

    result.sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortField === 'type') cmp = a.type.localeCompare(b.type)
      else if (sortField === 'transactions') cmp = (transactionCounts[a.id] || 0) - (transactionCounts[b.id] || 0)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [contacts, searchQuery, filterType, sortField, sortDir, transactionCounts])

  const selectedContact = contacts.find((c) => c.id === selectedId) || null

  // Recent transactions for selected contact
  const contactTransactions = useMemo(() => {
    if (!selectedId) return []
    return transactions
      .filter((t) => t.contactId === selectedId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
  }, [selectedId, transactions])

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const startCreate = () => {
    setEditForm({ ...emptyContact })
    setNewPattern('')
    setIsCreating(true)
    setIsEditing(true)
    setSelectedId(null)
  }

  const startEdit = () => {
    if (!selectedContact) return
    setEditForm({
      name: selectedContact.name,
      legalEntityName: selectedContact.legalEntityName,
      type: selectedContact.type,
      vatTaxId: selectedContact.vatTaxId,
      address: selectedContact.address,
      email: selectedContact.email,
      phone: selectedContact.phone,
      notes: selectedContact.notes,
      transactionPatterns: [...selectedContact.transactionPatterns],
      source: selectedContact.source
    })
    setNewPattern('')
    setIsEditing(true)
    setIsCreating(false)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setIsCreating(false)
  }

  const handleSave = async () => {
    if (!editForm.name.trim()) {
      toast.error('Contact name is required')
      return
    }

    try {
      if (isCreating) {
        const newContact = addContact(editForm)
        setSelectedId(newContact.id)
        toast.success('Contact created')
      } else if (selectedId) {
        updateContact(selectedId, editForm)
        toast.success('Contact updated')
      }
      await save()
      setIsEditing(false)
      setIsCreating(false)
    } catch (err) {
      console.error('Failed to save contact:', err)
      toast.error('Failed to save contact')
    }
  }

  const handleDelete = (contact: Contact) => {
    setContactToDelete(contact)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!contactToDelete) return
    try {
      deleteContact(contactToDelete.id)
      if (selectedId === contactToDelete.id) {
        setSelectedId(null)
        setIsEditing(false)
      }
      await save()
      toast.success('Contact deleted')
    } catch (err) {
      console.error('Failed to delete contact:', err)
      toast.error('Failed to delete contact')
    }
    setDeleteDialogOpen(false)
    setContactToDelete(null)
  }

  const addPattern = () => {
    const pattern = newPattern.trim()
    if (!pattern) return
    if (editForm.transactionPatterns.includes(pattern)) {
      toast.error('Pattern already exists')
      return
    }
    setEditForm({ ...editForm, transactionPatterns: [...editForm.transactionPatterns, pattern] })
    setNewPattern('')
  }

  const removePattern = (index: number) => {
    setEditForm({
      ...editForm,
      transactionPatterns: editForm.transactionPatterns.filter((_, i) => i !== index)
    })
  }

  return (
    <div className="flex h-full">
      {/* Left Panel - Contact List */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Contacts</h2>
            <button onClick={startCreate} className="btn-primary btn-sm flex items-center gap-1">
              <Plus size={14} />
              Add
            </button>
          </div>

          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="input-field text-sm pl-9"
            />
          </div>

          <div className="flex gap-1">
            {(['all', 'vendor', 'client', 'service'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                  filterType === type
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {type === 'all' ? 'All' : CONTACT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Sort Bar */}
        <div className="px-4 py-2 flex items-center gap-2 text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
          <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
            Name <ArrowUpDown size={10} />
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <button onClick={() => handleSort('type')} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
            Type <ArrowUpDown size={10} />
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <button onClick={() => handleSort('transactions')} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
            Txns <ArrowUpDown size={10} />
          </button>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Users size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No contacts found</p>
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => { setSelectedId(contact.id); setIsEditing(false); setIsCreating(false) }}
                className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${
                  selectedId === contact.id
                    ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-l-primary-600'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                    {contact.name}
                  </span>
                  <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${CONTACT_TYPE_COLORS[contact.type]}`}>
                    {CONTACT_TYPE_LABELS[contact.type]}
                  </span>
                  {transactionCounts[contact.id] ? (
                    <span className="text-xs text-gray-400">
                      {transactionCounts[contact.id]} txns
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 text-center">
          {contacts.length} total contacts
        </div>
      </div>

      {/* Right Panel - Detail / Edit */}
      <div className="flex-1 overflow-y-auto">
        {isEditing ? (
          /* Edit / Create Form */
          <div className="p-6 max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {isCreating ? 'New Contact' : 'Edit Contact'}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={cancelEdit} className="btn-secondary btn-sm flex items-center gap-1">
                  <X size={14} />
                  Cancel
                </button>
                <button onClick={handleSave} className="btn-primary btn-sm flex items-center gap-1">
                  <Save size={14} />
                  Save
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="input-field text-sm"
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Legal Entity</label>
                  <input
                    type="text"
                    value={editForm.legalEntityName}
                    onChange={(e) => setEditForm({ ...editForm, legalEntityName: e.target.value })}
                    className="input-field text-sm"
                    placeholder="Legal entity name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value as ContactType })}
                    className="input-field text-sm"
                  >
                    <option value="vendor">Vendor</option>
                    <option value="client">Client</option>
                    <option value="service">Service</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tax ID / VAT</label>
                  <input
                    type="text"
                    value={editForm.vatTaxId}
                    onChange={(e) => setEditForm({ ...editForm, vatTaxId: e.target.value })}
                    className="input-field text-sm"
                    placeholder="XX-XXXXXXX"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="input-field text-sm"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="input-field text-sm"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <textarea
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="input-field text-sm"
                  rows={2}
                  placeholder="Street, City, State, ZIP"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="input-field text-sm"
                  rows={3}
                  placeholder="Additional notes..."
                />
              </div>

              {/* Transaction Patterns */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Transaction Patterns
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Text patterns to automatically match transactions to this contact. Case-insensitive.
                </p>
                <div className="space-y-1 mb-2">
                  {editForm.transactionPatterns.map((pattern, index) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-1.5">
                      <span className="text-sm font-mono text-gray-700 dark:text-gray-300 flex-1 truncate">{pattern}</span>
                      <button
                        onClick={() => removePattern(index)}
                        className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {editForm.transactionPatterns.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No patterns configured</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPattern() } }}
                    className="input-field text-sm font-mono flex-1"
                    placeholder="e.g. AMAZON MARKETPLACE"
                  />
                  <button onClick={addPattern} className="btn-secondary btn-sm flex items-center gap-1">
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : selectedContact ? (
          /* Detail View */
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedContact.name}</h3>
                {selectedContact.legalEntityName && (
                  <p className="text-sm text-gray-500">{selectedContact.legalEntityName}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={startEdit} className="btn-secondary btn-sm flex items-center gap-1">
                  <Edit2 size={14} />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(selectedContact)}
                  className="btn-sm flex items-center gap-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 size={16} className="text-primary-600" />
                  <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Details</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Type</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CONTACT_TYPE_COLORS[selectedContact.type]}`}>
                      {CONTACT_TYPE_LABELS[selectedContact.type]}
                    </span>
                  </div>
                  {selectedContact.vatTaxId && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Tax ID</span>
                      <span className="text-gray-900 dark:text-gray-100 font-mono">{selectedContact.vatTaxId}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Source</span>
                    <span className="text-gray-900 dark:text-gray-100 capitalize">{selectedContact.source}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Created</span>
                    <span className="text-gray-900 dark:text-gray-100">{formatDate(selectedContact.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={16} className="text-primary-600" />
                  <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Contact Info</h4>
                </div>
                <div className="space-y-2 text-sm">
                  {selectedContact.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <span className="text-gray-900 dark:text-gray-100">{selectedContact.email}</span>
                    </div>
                  )}
                  {selectedContact.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-gray-400" />
                      <span className="text-gray-900 dark:text-gray-100">{selectedContact.phone}</span>
                    </div>
                  )}
                  {selectedContact.address && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-gray-400" />
                      <span className="text-gray-900 dark:text-gray-100">{selectedContact.address}</span>
                    </div>
                  )}
                  {!selectedContact.email && !selectedContact.phone && !selectedContact.address && (
                    <p className="text-gray-400 italic">No contact info</p>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="card p-4 mb-6">
              <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-3">Financial Summary</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Transactions</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {transactionCounts[selectedContact.id] || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Income</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(transactionTotals[selectedContact.id]?.income || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Expenses</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(transactionTotals[selectedContact.id]?.expense || 0)}
                  </p>
                </div>
              </div>
            </div>

            {/* Transaction Patterns */}
            {selectedContact.transactionPatterns.length > 0 && (
              <div className="card p-4 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={16} className="text-primary-600" />
                  <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Transaction Patterns</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedContact.transactionPatterns.map((pattern, i) => (
                    <span key={i} className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                      {pattern}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedContact.notes && (
              <div className="card p-4 mb-6">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2">Notes</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{selectedContact.notes}</p>
              </div>
            )}

            {/* Recent Transactions */}
            {contactTransactions.length > 0 && (
              <div className="card p-4">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-3">
                  Recent Transactions ({contactTransactions.length})
                </h4>
                <div className="space-y-1">
                  {contactTransactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{t.rawDescription}</p>
                        <p className="text-xs text-gray-400">{formatDate(t.date)}</p>
                      </div>
                      <span className={`text-sm font-medium ml-4 ${t.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t.amount > 0 ? '+' : '-'}{formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* No Selection */
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <Users size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Select a contact</p>
              <p className="text-sm">Choose a contact from the list to view details</p>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Delete Contact"
        message={`Are you sure you want to delete "${contactToDelete?.name}"? This will not remove the contact from existing transactions.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteDialogOpen(false); setContactToDelete(null) }}
      />
    </div>
  )
}
