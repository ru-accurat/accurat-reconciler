import React from 'react'
import type { Transaction } from '@/lib/types'

const STATUS_STYLES: Record<Transaction['status'], string> = {
  reconciled:   'bg-emerald-100 text-emerald-700',
  unreconciled: 'bg-amber-100   text-amber-700    ',
  flagged:      'bg-red-100     text-red-700        ',
  contract:     'bg-indigo-100  text-indigo-700  ',
  tax:          'bg-orange-100  text-orange-700  ',
}

const STATUS_LABELS: Record<Transaction['status'], string> = {
  reconciled:   'Reconciled',
  unreconciled: 'Unreconciled',
  flagged:      'Flagged',
  contract:     'Contract',
  tax:          'Tax',
}

interface StatusBadgeProps {
  status: Transaction['status']
  /** Override the displayed label (defaults to the canonical status name). */
  label?: string
  className?: string
}

/**
 * Single source of truth for transaction status colors. Used in tables,
 * filter pills, dashboard summaries — anywhere a status appears as a
 * pill.
 */
export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]} ${className}`}>
      {label ?? STATUS_LABELS[status]}
    </span>
  )
}

export { STATUS_STYLES, STATUS_LABELS }
