'use client'
import React, { useMemo } from 'react'
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { useTransactionStore } from '@/stores/transactionStore'
import { useContactStore } from '@/stores/contactStore'
import { useCategoryStore } from '@/stores/categoryStore'
import { formatCurrency } from '@/lib/formatters'
import { detectRecurringPatterns, RecurringPattern } from '@/lib/recurring'
import { format, subMonths, parseISO } from 'date-fns'

const PIE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#6366f1'
]

export default function DashboardPage() {
  const transactions = useTransactionStore((s) => s.transactions)
  const contacts = useContactStore((s) => s.contacts)
  const categories = useCategoryStore((s) => s.categories)

  const stats = useMemo(() => {
    const totalIncome = transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
    const totalExpenses = transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0)
    const netCashFlow = totalIncome - totalExpenses
    const unreconciled = transactions.filter((t) => t.status === 'unreconciled').length
    return { totalIncome, totalExpenses, netCashFlow, unreconciled }
  }, [transactions])

  const monthlyData = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i)
      months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') })
    }
    const grouped = new Map<string, { income: number; expenses: number }>()
    for (const m of months) grouped.set(m.key, { income: 0, expenses: 0 })
    for (const txn of transactions) {
      const monthKey = txn.date.substring(0, 7)
      const entry = grouped.get(monthKey)
      if (entry) {
        if (txn.amount > 0) entry.income += txn.amount
        else entry.expenses += Math.abs(txn.amount)
      }
    }
    return months.map((m) => ({
      name: m.label,
      income: Math.round((grouped.get(m.key)?.income ?? 0) * 100) / 100,
      expenses: Math.round((grouped.get(m.key)?.expenses ?? 0) * 100) / 100
    }))
  }, [transactions])

  const categoryData = useMemo(() => {
    const catMap = new Map<string, { name: string; color: string; total: number }>()
    for (const txn of transactions) {
      if (txn.amount >= 0) continue
      const catId = txn.categoryId || 'uncategorized'
      if (!catMap.has(catId)) {
        const cat = categories.find((c) => c.id === catId)
        catMap.set(catId, { name: cat?.name ?? 'Uncategorized', color: cat?.color ?? '#94a3b8', total: 0 })
      }
      catMap.get(catId)!.total += Math.abs(txn.amount)
    }
    const sorted = Array.from(catMap.values()).sort((a, b) => b.total - a.total)
    const top8 = sorted.slice(0, 8)
    const rest = sorted.slice(8)
    if (rest.length > 0) {
      top8.push({ name: 'Other', color: '#94a3b8', total: rest.reduce((sum, r) => sum + r.total, 0) })
    }
    return top8.map((item) => ({ name: item.name, value: Math.round(item.total * 100) / 100, color: item.color }))
  }, [transactions, categories])

  const cashFlowData = useMemo(() => {
    if (transactions.length === 0) return []
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
    let cumulative = 0
    const dataMap = new Map<string, number>()
    for (const txn of sorted) {
      cumulative += txn.amount
      dataMap.set(txn.date, cumulative)
    }
    return Array.from(dataMap.entries()).map(([date, value]) => ({
      date: format(parseISO(date), 'MMM dd'),
      fullDate: date,
      cashFlow: Math.round(value * 100) / 100
    }))
  }, [transactions])

  const recurringPatterns = useMemo(() => detectRecurringPatterns(transactions, contacts), [transactions, contacts])

  const cards = [
    { label: 'Total Income', value: formatCurrency(stats.totalIncome), icon: <TrendingUp size={20} />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Total Expenses', value: formatCurrency(stats.totalExpenses), icon: <TrendingDown size={20} />, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: 'Net Cash Flow', value: (stats.netCashFlow >= 0 ? '+' : '-') + formatCurrency(stats.netCashFlow), icon: <DollarSign size={20} />, color: stats.netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Unreconciled', value: String(stats.unreconciled), icon: <AlertCircle size={20} />, color: stats.unreconciled > 0 ? 'text-amber-600' : 'text-gray-600', bg: 'bg-amber-50 dark:bg-amber-900/20' }
  ]

  const formatTooltipValue = (value: number) => formatCurrency(value)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Financial overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">{card.label}</span>
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <span className={card.color}>{card.icon}</span>
              </div>
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-6">
          <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Monthly Income vs Expenses</h3>
          {transactions.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Import transactions to see monthly data</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={(val) => val.split(' ')[0]} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={formatTooltipValue} contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px' }} />
                  <Legend />
                  <Bar dataKey="income" fill="#10b981" name="Income" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Category Breakdown</h3>
          {categoryData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Categorize transactions to see breakdown</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }}>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={formatTooltipValue} contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-6">
          <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Cash Flow Trend</h3>
          {cashFlowData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Import transactions to see cash flow trend</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={formatTooltipValue}
                    labelFormatter={(_, payload) => { if (payload?.[0]?.payload?.fullDate) return payload[0].payload.fullDate; return '' }}
                    contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px' }} />
                  <defs>
                    <linearGradient id="cashFlowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="cashFlow" name="Cash Flow" stroke="#3b82f6" fill="url(#cashFlowGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <RefreshCw size={16} />
            Recurring Payments
          </h3>
          {recurringPatterns.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No recurring patterns detected yet</div>
          ) : (
            <div className="h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 font-medium">Vendor</th>
                    <th className="pb-2 font-medium">Frequency</th>
                    <th className="pb-2 font-medium text-right">Avg Amount</th>
                    <th className="pb-2 font-medium text-right">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recurringPatterns.slice(0, 10).map((pattern) => (
                    <tr key={pattern.contactId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-2 text-gray-900 dark:text-gray-100 font-medium">{pattern.contactName}</td>
                      <td className="py-2"><FrequencyBadge frequency={pattern.frequency} confidence={pattern.confidence} /></td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(pattern.avgAmount)}</td>
                      <td className="py-2 text-right text-gray-500">{pattern.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FrequencyBadge({ frequency, confidence }: { frequency: RecurringPattern['frequency']; confidence: number }) {
  const colors: Record<string, string> = {
    weekly: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    biweekly: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    monthly: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    quarterly: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    irregular: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[frequency] || colors.irregular}`}
      title={`Confidence: ${Math.round(confidence * 100)}%`}>
      {frequency}
    </span>
  )
}
