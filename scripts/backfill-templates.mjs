#!/usr/bin/env node
/**
 * One-shot backfill: derive InvoiceTemplate entries from existing
 * manual matches. Future invoices whose signature matches a template get
 * a contact-scoped score boost in the matcher.
 *
 *   node scripts/backfill-templates.mjs            # dry run
 *   node scripts/backfill-templates.mjs --write    # commit to Supabase
 *
 * Bonus diagnostic: after collecting templates, scans currently-unmatched
 * docs and logs which contact each would point at via template (informational
 * only — does not auto-match).
 */
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'
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

// ---- Mirrors src/lib/invoice-template.ts (kept in sync manually) ----
const TOKEN_STOPWORDS = new Set([
  'the','and','for','with','from','this','that','your','our','are','was','were',
  'has','have','had','will','shall','into','onto','invoice','receipt','bill',
  'billing','statement','order','page','date','due','paid','total','subtotal',
  'amount','amounts','tax','taxes','vat','discount','qty','quantity','price',
  'unit','item','description','number','code','reference','ref','customer',
  'client','vendor','address','phone','email','period','thank','thanks','you',
  'please','pay','payment','payments','all','any','see','usd','eur','gbp',
  'inc','llc','ltd','corp','srl','spa',
])

const normalizeVendor = (s) => {
  if (!s) return null
  const v = String(s).toLowerCase().trim().replace(/\s+/g, ' ')
  return v || null
}

const stripDatesAndAmounts = (text) => text
  .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
  .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
  .replace(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, ' ')
  .replace(/\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}\b/g, ' ')
  .replace(/\b\d+\.\d{2}\b/g, ' ')

const emailDomains = (emails) => {
  if (!emails || emails.length === 0) return []
  const set = new Set()
  for (const e of emails) {
    const at = e.indexOf('@')
    if (at > 0 && at < e.length - 1) set.add(e.slice(at + 1).toLowerCase().trim())
  }
  return [...set].sort()
}

const invoicePrefix = (n) => {
  if (!n) return null
  const t = String(n).trim()
  if (!t) return null
  const m = t.match(/^([^\d]+(?:[A-Z0-9]*[^0-9]+)*)/i)
  if (m && m[1] && m[1].length >= 2 && m[1].length < t.length) return m[1]
  const nn = t.match(/^[^\d]+/)
  return nn && nn[0].length >= 2 ? nn[0] : null
}

const topTokens = (text, n) => {
  const stripped = stripDatesAndAmounts(text || '').toLowerCase()
  const counts = new Map()
  const tokens = stripped.split(/[^a-zà-ÿ]+/).filter(t => t.length >= 4 && !TOKEN_STOPWORDS.has(t))
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return ranked.slice(0, n).map(([t]) => t).sort()
}

const computeTextHash = (text) => {
  const normalized = stripDatesAndAmounts(text || '')
    .toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 1500)
  return createHash('sha256').update(normalized).digest('hex')
}

const computeSignature = (doc) => {
  const ents = doc.extractedEntities
  return {
    vendorNormalized: normalizeVendor(doc.extractedVendor),
    emailDomains: emailDomains(ents?.emails),
    vatTaxIds: ents?.vatTaxIds ? [...ents.vatTaxIds].sort() : [],
    invoiceNumberPrefix: invoicePrefix(doc.extractedInvoiceNumber),
    lineItemTokens: topTokens(doc.extractedText || '', 6),
    textHash: computeTextHash(doc.extractedText || ''),
  }
}

const WEIGHTS = { vendor: 0.30, emailDomain: 0.20, vatId: 0.15, invoicePrefix: 0.20, textHash: 0.10, lineItemTokens: 0.05 }
const setOverlap = (a, b) => {
  if (!a.length || !b.length) return 0
  const sa = new Set(a), sb = new Set(b)
  let common = 0
  for (const x of sa) if (sb.has(x)) common++
  return common / Math.min(sa.size, sb.size)
}
const signatureMatch = (a, b) => {
  let s = 0
  if (a.vendorNormalized && b.vendorNormalized) {
    if (a.vendorNormalized === b.vendorNormalized) s += WEIGHTS.vendor
    else if (a.vendorNormalized.includes(b.vendorNormalized) || b.vendorNormalized.includes(a.vendorNormalized)) s += WEIGHTS.vendor * 0.6
  }
  s += setOverlap(a.emailDomains, b.emailDomains) * WEIGHTS.emailDomain
  s += setOverlap(a.vatTaxIds, b.vatTaxIds) * WEIGHTS.vatId
  if (a.invoiceNumberPrefix && b.invoiceNumberPrefix) {
    if (a.invoiceNumberPrefix === b.invoiceNumberPrefix) s += WEIGHTS.invoicePrefix
    else if (a.invoiceNumberPrefix.startsWith(b.invoiceNumberPrefix) || b.invoiceNumberPrefix.startsWith(a.invoiceNumberPrefix)) s += WEIGHTS.invoicePrefix * 0.5
  }
  if (a.textHash && b.textHash && a.textHash === b.textHash) s += WEIGHTS.textHash
  s += setOverlap(a.lineItemTokens, b.lineItemTokens) * WEIGHTS.lineItemTokens
  return Math.min(1, s)
}
const TEMPLATE_MATCH_THRESHOLD = 0.55

// ---- Main ----
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const { data: docsRow, error: dErr } = await supabase.from('app_data').select('value').eq('key', 'documents').single()
if (dErr) { console.error('FETCH documents ERROR:', dErr); process.exit(1) }
const { data: txnsRow, error: tErr } = await supabase.from('app_data').select('value').eq('key', 'transactions').single()
if (tErr) { console.error('FETCH transactions ERROR:', tErr); process.exit(1) }
const { data: contactsRow } = await supabase.from('app_data').select('value').eq('key', 'contacts').single()
const { data: tmplRow } = await supabase.from('app_data').select('value').eq('key', 'invoiceTemplates').single()

const docs = docsRow.value.documents || []
const txns = txnsRow.value.transactions || []
const contacts = (contactsRow?.value?.contacts) || []
const existingTemplates = (tmplRow?.value?.templates) || []
const txnById = new Map(txns.map(t => [t.id, t]))
const contactById = new Map(contacts.map(c => [c.id, c]))

const existingByDocId = new Set(existingTemplates.map(t => t.learnedFromDocId))

const newTemplates = []
let skippedExisting = 0
let skippedAmbiguous = 0
let skippedNoContact = 0

for (const doc of docs) {
  if (doc.matchMethod !== 'manual' || !Array.isArray(doc.matchedTransactionIds) || doc.matchedTransactionIds.length === 0) continue
  if (existingByDocId.has(doc.id)) { skippedExisting++; continue }

  const contactIds = new Set()
  for (const tid of doc.matchedTransactionIds) {
    const t = txnById.get(tid)
    if (t?.contactId) contactIds.add(t.contactId)
  }
  if (contactIds.size === 0) {
    skippedNoContact++
    console.log(`  SKIP no-contact     ${doc.id}  ${doc.originalFilename}`)
    continue
  }
  if (contactIds.size > 1) {
    skippedAmbiguous++
    console.log(`  SKIP ambiguous (${contactIds.size} contacts)  ${doc.id}  ${doc.originalFilename}`)
    continue
  }
  const contactId = [...contactIds][0]
  const contactName = contactById.get(contactId)?.name ?? '(unknown)'

  const sig = computeSignature(doc)
  const tmpl = {
    id: randomUUID(),
    contactId,
    signature: sig,
    learnedFromDocId: doc.id,
    learnedAt: new Date().toISOString(),
  }
  newTemplates.push(tmpl)
  console.log(`  ADD ${doc.id} -> contact "${contactName}"  vendor="${sig.vendorNormalized ?? '∅'}"  invPrefix="${sig.invoiceNumberPrefix ?? '∅'}"  domains=${JSON.stringify(sig.emailDomains)}`)
}

console.log(`\n=== Summary ===`)
console.log(`  total docs:          ${docs.length}`)
console.log(`  manual-matched docs: ${docs.filter(d => d.matchMethod === 'manual' && d.matchedTransactionIds?.length > 0).length}`)
console.log(`  existing templates:  ${existingTemplates.length}`)
console.log(`  new templates:       ${newTemplates.length}`)
console.log(`  skipped (existing):  ${skippedExisting}`)
console.log(`  skipped (ambiguous): ${skippedAmbiguous}`)
console.log(`  skipped (no contact):${skippedNoContact}`)
console.log(`  mode:                ${WRITE ? 'WRITE (will update Supabase)' : 'DRY RUN (use --write to commit)'}`)

// Bonus diagnostic
const allTemplates = [...existingTemplates, ...newTemplates]
if (allTemplates.length > 0) {
  console.log(`\n=== Diagnostic: would-match for currently unmatched docs ===`)
  const unmatched = docs.filter(d => !d.matchedTransactionIds || d.matchedTransactionIds.length === 0)
  let hits = 0
  for (const doc of unmatched) {
    const sig = computeSignature(doc)
    let bestScore = 0, bestT = null
    for (const t of allTemplates) {
      const s = signatureMatch(sig, t.signature)
      if (s >= TEMPLATE_MATCH_THRESHOLD && s > bestScore) { bestScore = s; bestT = t }
    }
    if (bestT) {
      const cn = contactById.get(bestT.contactId)?.name ?? '(unknown)'
      console.log(`  ${doc.id}  "${doc.originalFilename}" -> contact "${cn}" via template ${bestT.id.slice(0,8)} (score ${bestScore.toFixed(3)})`)
      hits++
    }
  }
  console.log(`  total would-match: ${hits} / ${unmatched.length} unmatched`)
}

if (WRITE && newTemplates.length > 0) {
  const merged = [...existingTemplates, ...newTemplates]
  const newBlob = { version: 1, lastModified: new Date().toISOString(), templates: merged }
  const { error: updErr } = await supabase
    .from('app_data')
    .upsert({ key: 'invoiceTemplates', value: newBlob, updated_at: new Date().toISOString() })
  if (updErr) { console.error('\nUPDATE ERROR:', updErr); process.exit(1) }
  console.log(`\nWrote ${newTemplates.length} new templates to Supabase.`)
}
