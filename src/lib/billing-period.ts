import { Transaction, Contact } from './types'

const ARREARS_VENDORS = [
  'con edison', 'coned', 'consolidated edison',
  'spectrum', 'charter', 't-mobile', 'tmobile',
  'national grid', 'pseg', 'verizon fios'
]

export function inferBillingPeriod(
  transaction: Transaction,
  contact: Contact | undefined
): { month: number; year: number } | null {
  if (transaction.billingPeriodOverride && transaction.billingPeriod) {
    return transaction.billingPeriod
  }

  const date = new Date(transaction.date)
  if (isNaN(date.getTime())) return null

  const txnMonth = date.getMonth() + 1
  const txnYear = date.getFullYear()

  const isArrears = isArrearsVendor(transaction.rawDescription, contact)

  if (isArrears) {
    if (txnMonth === 1) {
      return { month: 12, year: txnYear - 1 }
    }
    return { month: txnMonth - 1, year: txnYear }
  }

  return { month: txnMonth, year: txnYear }
}

function isArrearsVendor(description: string, contact: Contact | undefined): boolean {
  const descLower = description.toLowerCase()
  const contactNameLower = contact?.name?.toLowerCase() ?? ''

  return ARREARS_VENDORS.some(
    (vendor) => descLower.includes(vendor) || contactNameLower.includes(vendor)
  )
}
