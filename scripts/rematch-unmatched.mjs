#!/usr/bin/env node
/**
 * Re-runs the document matcher against every currently unmatched
 * DocumentRecord, using the latest templates and excluding transactions
 * already claimed by other docs. Mirrors the in-app "Auto-Match" button
 * but executable from the CLI.
 *
 *   1. Make sure `npm run dev` is running on localhost:3000.
 *   2. node scripts/rematch-unmatched.mjs            # dry run
 *   3. node scripts/rematch-unmatched.mjs --write    # apply matches
 *
 * The endpoint at /api/rematch-unmatched does the heavy lifting using
 * the same matcher code the UI uses — single source of truth.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const WRITE = process.argv.includes('--write')
const API_BASE = process.env.RECONCILER_API_BASE || 'http://localhost:3000'

const res = await fetch(`${API_BASE}/api/rematch-unmatched`, { method: 'POST' })
if (!res.ok) {
  console.error(`api/rematch-unmatched returned ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const { totalDocs, unmatched, claimedBefore, proposals } = await res.json()

console.log(`Total docs:              ${totalDocs}`)
console.log(`Currently unmatched:     ${unmatched}`)
console.log(`Claimed transactions:    ${claimedBefore}`)
console.log(`Proposed auto-matches:   ${proposals.length}`)
console.log()

if (proposals.length === 0) {
  console.log('No new auto-matches found.')
  process.exit(0)
}

console.log('=== Proposals ===')
for (const p of proposals) {
  const tplInfo = p.templateMatchScore ? ` template=${p.templateMatchScore.toFixed(2)}` : ''
  const ids = p.transactionIds ?? (p.transactionId ? [p.transactionId] : [])
  const multiInfo = ids.length > 1 ? ` [${ids.length} txns]` : ''
  console.log(`  ${p.docId.slice(0, 8)}  ${p.originalFilename.padEnd(34)}  $${p.extractedAmount}  vendor="${p.extractedVendor}"  -> ${p.contactName ?? '(no contact)'}  score=${p.score}${tplInfo}${multiInfo}`)
}

if (!WRITE) {
  console.log('\nDRY RUN — pass --write to apply.')
  process.exit(0)
}

// Apply matches: read fresh state, mutate documents + transactions, write back.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const [{ data: docsRow }, { data: txnsRow }] = await Promise.all([
  supabase.from('app_data').select('value').eq('key', 'documents').single(),
  supabase.from('app_data').select('value').eq('key', 'transactions').single(),
])
const docsBlob = docsRow.value
const txnsBlob = txnsRow.value
const docs = docsBlob.documents || []
const txns = txnsBlob.transactions || []

const proposalByDocId = new Map(proposals.map(p => [p.docId, p]))
const claimedNow = new Map() // txnId -> docId, to update transactions in lockstep

const updatedDocs = docs.map(d => {
  const p = proposalByDocId.get(d.id)
  if (!p) return d
  const ids = p.transactionIds ?? (p.transactionId ? [p.transactionId] : [])
  for (const id of ids) claimedNow.set(id, d.id)
  return {
    ...d,
    matchedTransactionIds: ids,
    matchConfidence: p.score,
    matchMethod: 'auto',
  }
})

const updatedTxns = txns.map(t => {
  const docId = claimedNow.get(t.id)
  if (!docId) return t
  const docIds = Array.isArray(t.documentIds) ? t.documentIds : []
  if (docIds.includes(docId)) return t
  return { ...t, documentIds: [...docIds, docId], status: 'reconciled' }
})

const newDocsBlob = { ...docsBlob, documents: updatedDocs, lastModified: new Date().toISOString() }
const newTxnsBlob = { ...txnsBlob, transactions: updatedTxns, lastModified: new Date().toISOString() }

const [{ error: docsErr }, { error: txnsErr }] = await Promise.all([
  supabase.from('app_data').update({ value: newDocsBlob, updated_at: new Date().toISOString() }).eq('key', 'documents'),
  supabase.from('app_data').update({ value: newTxnsBlob, updated_at: new Date().toISOString() }).eq('key', 'transactions'),
])
if (docsErr) { console.error('docs UPDATE ERROR:', docsErr); process.exit(1) }
if (txnsErr) { console.error('transactions UPDATE ERROR:', txnsErr); process.exit(1) }

console.log(`\nApplied ${proposals.length} auto-matches.`)
