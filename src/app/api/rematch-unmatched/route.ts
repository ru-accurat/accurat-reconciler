import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { matchDocument, isAutoMatch } from '@/lib/document-matcher'
import { Transaction, DocumentRecord, Contact, VendorAlias } from '@/lib/types'
import { InvoiceTemplate } from '@/lib/invoice-template'

// Re-runs the document matcher across every unmatched DocumentRecord using
// the latest templates and the transactions-already-claimed exclusion set.
// Returns the list of proposed auto-matches; the caller is responsible for
// applying them. Read-only — does not mutate Supabase.
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env not set' }, { status: 500 })
  const supabase = createClient(url, key)

  const fetchKey = async <T,>(k: string, field: string): Promise<T[]> => {
    const { data } = await supabase.from('app_data').select('value').eq('key', k).single()
    return (data?.value?.[field] ?? []) as T[]
  }

  const [docs, transactions, contacts, vendorAliases, templates] = await Promise.all([
    fetchKey<DocumentRecord>('documents', 'documents'),
    fetchKey<Transaction>('transactions', 'transactions'),
    fetchKey<Contact>('contacts', 'contacts'),
    fetchKey<VendorAlias>('vendorAliases', 'aliases'),
    fetchKey<InvoiceTemplate>('invoiceTemplates', 'templates'),
  ])

  const claimedTxnIds = new Set<string>(docs.flatMap(d => d.matchedTransactionIds ?? []))
  const unmatched = docs.filter(d => (d.matchedTransactionIds ?? []).length === 0)

  const proposals: Array<{
    docId: string
    originalFilename: string
    extractedVendor: string | null
    extractedAmount: number | null
    transactionId: string
    score: number
    templateMatchScore?: number
    templateContactId?: string | null
    contactName: string | null
  }> = []

  const contactById = new Map(contacts.map(c => [c.id, c]))

  for (const doc of unmatched) {
    const candidates = matchDocument(doc, transactions, contacts, vendorAliases, templates, claimedTxnIds)
    if (!isAutoMatch(candidates)) continue
    const best = candidates[0]
    claimedTxnIds.add(best.transactionId)
    const txn = transactions.find(t => t.id === best.transactionId)
    proposals.push({
      docId: doc.id,
      originalFilename: doc.originalFilename,
      extractedVendor: doc.extractedVendor ?? null,
      extractedAmount: doc.extractedAmount ?? null,
      transactionId: best.transactionId,
      score: best.score,
      templateMatchScore: best.templateMatchScore,
      templateContactId: best.templateContactId,
      contactName: txn?.contactId ? contactById.get(txn.contactId)?.name ?? null : null,
    })
  }

  return NextResponse.json({
    totalDocs: docs.length,
    unmatched: unmatched.length,
    claimedBefore: docs.flatMap(d => d.matchedTransactionIds ?? []).length,
    proposals,
  })
}
