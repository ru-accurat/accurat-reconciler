import { Transaction, Contact } from './types'
import { addDays, format } from 'date-fns'

export interface RecurringPattern {
  contactId: string
  contactName: string
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'irregular'
  avgAmount: number
  avgIntervalDays: number
  confidence: number
  transactionCount: number
  lastDate: string
  nextExpectedDate: string
}

function classifyFrequency(
  avgInterval: number
): 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'irregular' {
  if (avgInterval >= 5 && avgInterval <= 9) return 'weekly'
  if (avgInterval >= 12 && avgInterval <= 16) return 'biweekly'
  if (avgInterval >= 25 && avgInterval <= 35) return 'monthly'
  if (avgInterval >= 85 && avgInterval <= 95) return 'quarterly'
  return 'irregular'
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2))
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length)
}

export function detectRecurringPatterns(
  transactions: Transaction[],
  contacts: Contact[]
): RecurringPattern[] {
  const contactMap = new Map<string, Contact>()
  for (const c of contacts) {
    contactMap.set(c.id, c)
  }

  const byContact = new Map<string, Transaction[]>()
  for (const txn of transactions) {
    if (!txn.contactId) continue
    const existing = byContact.get(txn.contactId) || []
    existing.push(txn)
    byContact.set(txn.contactId, existing)
  }

  const patterns: RecurringPattern[] = []

  for (const [contactId, txns] of byContact.entries()) {
    if (txns.length < 3) continue

    const contact = contactMap.get(contactId)
    if (!contact) continue

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))

    const intervals: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date)
      const curr = new Date(sorted[i].date)
      const diffDays = Math.round(
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diffDays > 0) {
        intervals.push(diffDays)
      }
    }

    if (intervals.length === 0) continue

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const stdDev = standardDeviation(intervals)
    const confidence = avgInterval > 0 ? Math.max(0, Math.min(1, 1 - stdDev / avgInterval)) : 0

    if (confidence < 0.3 && classifyFrequency(avgInterval) === 'irregular') continue

    const frequency = classifyFrequency(avgInterval)
    const amounts = sorted.map((t) => Math.abs(t.amount))
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length

    const lastDate = sorted[sorted.length - 1].date
    const nextExpectedDate = format(
      addDays(new Date(lastDate), Math.round(avgInterval)),
      'yyyy-MM-dd'
    )

    patterns.push({
      contactId,
      contactName: contact.name,
      frequency,
      avgAmount,
      avgIntervalDays: Math.round(avgInterval),
      confidence,
      transactionCount: sorted.length,
      lastDate,
      nextExpectedDate
    })
  }

  return patterns.sort((a, b) => b.confidence - a.confidence)
}
