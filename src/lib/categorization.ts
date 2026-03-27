import { Transaction, CategorizationRule, Contact } from './types'

export function applyRulesToTransactions(
  transactions: Transaction[],
  rules: CategorizationRule[],
  contacts: Contact[]
): Transaction[] {
  const sortedRules = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority)

  return transactions.map((txn) => {
    if (txn.categoryId && txn.contactId) return txn

    for (const rule of sortedRules) {
      if (matchesRule(txn.rawDescription, rule)) {
        const updates: Partial<Transaction> = {}
        if (!txn.categoryId) updates.categoryId = rule.categoryId
        if (!txn.contactId && rule.contactId) updates.contactId = rule.contactId
        updates.ruleIdApplied = rule.id
        return { ...txn, ...updates }
      }
    }
    return txn
  })
}

function matchesRule(description: string, rule: CategorizationRule): boolean {
  const desc = rule.caseSensitive ? description : description.toLowerCase()
  const pattern = rule.caseSensitive ? rule.pattern : rule.pattern.toLowerCase()

  switch (rule.matchType) {
    case 'exact':
      return desc === pattern
    case 'contains':
      return desc.includes(pattern)
    case 'regex':
      try {
        const flags = rule.caseSensitive ? '' : 'i'
        return new RegExp(rule.pattern, flags).test(description)
      } catch {
        return false
      }
  }
}

export function applyContractPatterns(
  transactions: Transaction[],
  contractPatterns: string[]
): Transaction[] {
  if (!contractPatterns || contractPatterns.length === 0) return transactions

  const lowerPatterns = contractPatterns.map((p) => p.toLowerCase())

  return transactions.map((txn) => {
    if (txn.status !== 'unreconciled') return txn

    const desc = txn.rawDescription.toLowerCase()
    const isContract = lowerPatterns.some((pattern) => desc.includes(pattern))

    if (isContract) {
      return { ...txn, status: 'contract' as const }
    }
    return txn
  })
}

export function suggestPattern(description: string): string {
  const parts = description.split(':')
  let pattern = parts[0].trim()
  pattern = pattern.replace(/\s+\d{5,}.*$/, '')
  pattern = pattern.replace(/\s+[A-Z0-9]{8,}$/, '')
  pattern = pattern.replace(/\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/gi, '')
  return pattern.trim()
}
