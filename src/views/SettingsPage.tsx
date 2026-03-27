'use client'
import React, { useState } from 'react'
import { Settings, Palette, FileInput, Info, Building2, Save, Plus, X, List, FileSignature } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSettingsStore } from '@/stores/settingsStore'

export default function SettingsPage() {
  const { settings, updateSettings, setTheme, save } = useSettingsStore()
  const [newLabel, setNewLabel] = useState('')
  const [newContractPattern, setNewContractPattern] = useState('')

  const handleSave = async () => {
    try {
      await save()
      toast.success('Settings saved')
    } catch (err) {
      console.error('Failed to save settings:', err)
      toast.error('Failed to save settings')
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Configure application preferences</p>
        </div>
        <button onClick={handleSave} className="btn-primary flex items-center gap-2">
          <Save size={16} />
          Save Settings
        </button>
      </div>

      <div className="space-y-6">
        {/* Business Info */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-primary-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Business Info</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Name</label>
              <input type="text" value={settings.businessName} onChange={(e) => updateSettings({ businessName: e.target.value })} placeholder="Your Business Name" className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tax ID (EIN)</label>
              <input type="text" value={settings.businessTaxId} onChange={(e) => updateSettings({ businessTaxId: e.target.value })} placeholder="XX-XXXXXXX" className="input-field text-sm" />
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Palette size={18} className="text-primary-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Appearance</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Theme</label>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((theme) => (
                <button key={theme} onClick={() => setTheme(theme)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors capitalize ${
                    settings.theme === theme
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}>
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* CSV Import Settings */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileInput size={18} className="text-primary-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">CSV Import</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Bank Format</label>
              <select value={settings.defaultBank} onChange={(e) => updateSettings({ defaultBank: e.target.value as 'chase' })} className="input-field text-sm">
                <option value="chase">Chase</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Format</label>
              <select value={settings.csvDateFormat} onChange={(e) => updateSettings({ csvDateFormat: e.target.value })} className="input-field text-sm">
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
          </div>
        </section>

        {/* PDF Amount Extraction Labels */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <List size={18} className="text-primary-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">PDF Amount Extraction Labels</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">Custom text labels that the PDF scanner looks for when extracting amounts from documents. These have the highest priority during extraction.</p>
          <div className="space-y-2 mb-4">
            {(settings.customAmountLabels || []).map((label, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 font-mono truncate">{label}</span>
                <button onClick={() => { const updated = (settings.customAmountLabels || []).filter((_, i) => i !== index); updateSettings({ customAmountLabels: updated }) }}
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" title="Remove label">
                  <X size={14} />
                </button>
              </div>
            ))}
            {(settings.customAmountLabels || []).length === 0 && <p className="text-sm text-gray-400 italic">No custom labels configured</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newLabel.trim()) { e.preventDefault(); const current = settings.customAmountLabels || []; if (!current.includes(newLabel.trim())) { updateSettings({ customAmountLabels: [...current, newLabel.trim()] }); setNewLabel('') } else { toast.error('Label already exists') } } }}
              placeholder="e.g. Total Due by Auto Pay" className="input-field text-sm font-mono flex-1" />
            <button onClick={() => { if (!newLabel.trim()) return; const current = settings.customAmountLabels || []; if (current.includes(newLabel.trim())) { toast.error('Label already exists'); return }; updateSettings({ customAmountLabels: [...current, newLabel.trim()] }); setNewLabel('') }}
              className="btn-secondary btn-sm flex items-center gap-1.5"><Plus size={14} />Add</button>
          </div>
        </section>

        {/* Contract Patterns */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileSignature size={18} className="text-primary-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Contract Patterns</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">Transaction descriptions containing any of these strings will automatically be labeled with the &quot;Contract&quot; status when imported. Matching is case-insensitive.</p>
          <div className="space-y-2 mb-4">
            {(settings.contractPatterns || []).map((pattern, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 font-mono truncate">{pattern}</span>
                <button onClick={() => { const updated = (settings.contractPatterns || []).filter((_, i) => i !== index); updateSettings({ contractPatterns: updated }) }}
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" title="Remove pattern">
                  <X size={14} />
                </button>
              </div>
            ))}
            {(settings.contractPatterns || []).length === 0 && <p className="text-sm text-gray-400 italic">No contract patterns configured</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newContractPattern} onChange={(e) => setNewContractPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newContractPattern.trim()) { e.preventDefault(); const current = settings.contractPatterns || []; if (!current.includes(newContractPattern.trim())) { updateSettings({ contractPatterns: [...current, newContractPattern.trim()] }); setNewContractPattern('') } else { toast.error('Pattern already exists') } } }}
              placeholder="e.g. LEASE AGREEMENT" className="input-field text-sm font-mono flex-1" />
            <button onClick={() => { if (!newContractPattern.trim()) return; const current = settings.contractPatterns || []; if (current.includes(newContractPattern.trim())) { toast.error('Pattern already exists'); return }; updateSettings({ contractPatterns: [...current, newContractPattern.trim()] }); setNewContractPattern('') }}
              className="btn-secondary btn-sm flex items-center gap-1.5"><Plus size={14} />Add</button>
          </div>
        </section>

        {/* About */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info size={18} className="text-primary-600" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">About</h3>
          </div>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center justify-between">
              <span>App Version</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Built with</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">Next.js + React + TypeScript</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Database</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">Supabase</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Charts</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">Recharts</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
