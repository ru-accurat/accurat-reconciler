import { format, parseISO } from 'date-fns'

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(Math.abs(amount))
}

export function formatDate(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'MMM dd, yyyy')
  } catch {
    return isoDate
  }
}

export function formatDateShort(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'MM/dd/yy')
  } catch {
    return isoDate
  }
}

export function formatBillingPeriod(bp: { month: number; year: number } | null): string {
  if (!bp) return '—'
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]
  return `${months[bp.month - 1]} ${bp.year}`
}

export function cleanDescription(raw: string): string {
  return raw
    .replace(/\s*:\s*(DEBIT PURCHASE|ACH Electronic Credit|OTHER DECREASE|DEBIT RETURN|ZELLE (CREDIT|DEBIT)).*$/i, '')
    .replace(/\s*PAY ID\s+\S+\s+ORG ID\s+\S+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '...'
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]
