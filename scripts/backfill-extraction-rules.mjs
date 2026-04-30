#!/usr/bin/env node
/**
 * One-shot backfill: derive vendor-specific extraction rules from existing
 * manual matches, looking at every (doc, txn) pair where the extracted
 * amount or date didn't match the actual transaction value.
 *
 *   node scripts/backfill-extraction-rules.mjs            # dry run
 *   node scripts/backfill-extraction-rules.mjs --write    # commit to Supabase
 *
 * Rules need >=2 evidence to activate. Dry-run prints which rules will
 * activate vs remain tentative. After --write, prints a hint about which
 * currently-unmatched docs could benefit from re-extraction (no re-extraction
 * is done — that's a follow-up UX).
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
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

// ---- Mirrors src/lib/extraction-feedback.ts (kept in sync manually) ----
const LABEL_DENY = new Set([
  'subtotal', 'sub-total', 'sub total', 'discount', 'refund', 'previous',
  'previous balance', 'balance forward', 'opening balance', 'last bill',
  'tax', 'vat', 'shipping', 'tip', 'gratuity', 'rounding',
])
const COMMON_DATE_LABELS = new Set([
  'date', 'invoice date', 'bill date', 'issued', 'issue date',
])
const normalizeVendor = (s) => {
  if (!s) return null
  const v = String(s).toLowerCase().trim().replace(/\s+/g, ' ')
  return v || null
}

const amountVariants = (a) => {
  const abs = Math.abs(a)
  const fixed = abs.toFixed(2)
  const [whole, frac] = fixed.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + frac
  return [...new Set([fixed, withCommas, `$${fixed}`, `$${withCommas}`, `$ ${fixed}`, `$ ${withCommas}`])]
}
const dateVariants = (iso) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso ? [iso] : []
  const [, y, mo, d] = m
  const moNum = parseInt(mo, 10), dNum = parseInt(d, 10)
  return [...new Set([iso, `${moNum}/${dNum}/${y}`, `${mo}/${d}/${y}`, `${moNum}/${dNum}/${y.slice(2)}`, `${dNum}/${moNum}/${y}`, `${d}/${mo}/${y}`])]
}

function extractLabelBefore(text, valueIndex, maxChars) {
  if (valueIndex <= 0) return null
  const start = Math.max(0, valueIndex - maxChars)
  const window = text.slice(start, valueIndex)
  const trimmed = window.replace(/[\s:$,\-=>]+$/g, '')
  if (!trimmed) return null
  const lastNl = trimmed.lastIndexOf('\n')
  const segment = (lastNl >= 0 ? trimmed.slice(lastNl + 1) : trimmed).trim()
  if (!segment) return null
  const tokens = segment.split(/\s+/).filter(Boolean)
  const cleaned = []
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (/^[\d.,$\-:/\\]+$/.test(t)) break
    cleaned.unshift(t)
    if (cleaned.length >= 3) break
  }
  if (cleaned.length === 0) return null
  const label = cleaned.map(t => t.replace(/[:,;.()\[\]{}]+$/g, '').replace(/^[:,;.()\[\]{}]+/g, '')).filter(Boolean).join(' ').trim()
  if (!label) return null
  if (label.length > 40) return null
  if (!/[a-zA-Z]{2,}/.test(label)) return null
  if (LABEL_DENY.has(label.toLowerCase())) return null
  return label
}

function inferRulesFromMatch(doc, txn) {
  const vendor = normalizeVendor(doc.extractedVendor)
  if (!vendor) return []
  const text = doc.extractedText || ''
  const out = []
  const learnedAt = new Date().toISOString()

  const txnAmt = Math.abs(txn.amount)
  const docAmt = doc.extractedAmount === null || doc.extractedAmount === undefined ? null : Math.abs(doc.extractedAmount)
  if (txnAmt > 0 && (docAmt === null || Math.abs(docAmt - txnAmt) > 0.01)) {
    for (const v of amountVariants(txnAmt)) {
      const idx = text.indexOf(v)
      if (idx === -1) continue
      const label = extractLabelBefore(text, idx, 30)
      if (!label) continue
      out.push({ id: randomUUID(), vendorNormalized: vendor, field: 'amount', label, evidence: [{ docId: doc.id, learnedAt }] })
      break
    }
  }
  if (txn.date && doc.extractedDate !== txn.date) {
    for (const v of dateVariants(txn.date)) {
      const idx = text.indexOf(v)
      if (idx === -1) continue
      const label = extractLabelBefore(text, idx, 30)
      if (!label) continue
      if (COMMON_DATE_LABELS.has(label.toLowerCase())) continue
      out.push({ id: randomUUID(), vendorNormalized: vendor, field: 'date', label, evidence: [{ docId: doc.id, learnedAt }] })
      break
    }
  }
  return out
}

function mergeRule(existing, incoming) {
  const idx = existing.findIndex(r =>
    r.vendorNormalized === incoming.vendorNormalized &&
    r.field === incoming.field &&
    r.label.toLowerCase() === incoming.label.toLowerCase()
  )
  if (idx === -1) return [...existing, incoming]
  const target = existing[idx]
  const haveDocs = new Set(target.evidence.map(e => e.docId))
  const additions = incoming.evidence.filter(e => !haveDocs.has(e.docId))
  if (additions.length === 0) return existing
  const next = existing.slice()
  next[idx] = { ...target, evidence: [...target.evidence, ...additions] }
  return next
}

// ---- Main ----
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const { data: docsRow, error: dErr } = await supabase.from('app_data').select('value').eq('key', 'documents').single()
if (dErr) { console.error('FETCH documents ERROR:', dErr); process.exit(1) }
const { data: txnsRow, error: tErr } = await supabase.from('app_data').select('value').eq('key', 'transactions').single()
if (tErr) { console.error('FETCH transactions ERROR:', tErr); process.exit(1) }
const { data: rulesRow } = await supabase.from('app_data').select('value').eq('key', 'vendorExtractionRules').single()

const docs = docsRow.value.documents || []
const txns = txnsRow.value.transactions || []
const existingRules = (rulesRow?.value?.rules) || []
const txnById = new Map(txns.map(t => [t.id, t]))

let rules = existingRules.slice()
let ruleAdditions = 0

for (const doc of docs) {
  if (doc.matchMethod !== 'manual' || !Array.isArray(doc.matchedTransactionIds) || doc.matchedTransactionIds.length === 0) continue
  // Use the first matched transaction with a contact — same convention as the UI.
  const txn = doc.matchedTransactionIds.map(id => txnById.get(id)).find(t => t?.contactId) || txnById.get(doc.matchedTransactionIds[0])
  if (!txn) continue
  const inferred = inferRulesFromMatch(doc, txn)
  for (const r of inferred) {
    const before = rules
    rules = mergeRule(rules, r)
    if (rules !== before) ruleAdditions++
  }
}

const isActive = (r) => r.evidence.length >= 2
const active = rules.filter(isActive)
const tentative = rules.filter(r => !isActive(r))

console.log(`\n=== Active rules (>=2 evidence) ===`)
for (const r of active) {
  console.log(`  ${r.vendorNormalized}  field=${r.field}  label="${r.label}"  evidence=${r.evidence.length}`)
}
console.log(`\n=== Tentative rules (1 evidence — needs more) ===`)
for (const r of tentative) {
  console.log(`  ${r.vendorNormalized}  field=${r.field}  label="${r.label}"`)
}

console.log(`\n=== Summary ===`)
console.log(`  total docs:           ${docs.length}`)
console.log(`  manual-matched docs:  ${docs.filter(d => d.matchMethod === 'manual' && d.matchedTransactionIds?.length > 0).length}`)
console.log(`  existing rules:       ${existingRules.length}`)
console.log(`  rule additions:       ${ruleAdditions}`)
console.log(`  total rules now:      ${rules.length}`)
console.log(`  active (>=2 ev):      ${active.length}`)
console.log(`  tentative (1 ev):     ${tentative.length}`)
console.log(`  mode:                 ${WRITE ? 'WRITE (will update Supabase)' : 'DRY RUN (use --write to commit)'}`)

// Diagnostic: which currently-unmatched docs share a vendor with an active rule
if (active.length > 0) {
  const activeByVendor = new Map()
  for (const r of active) {
    if (!activeByVendor.has(r.vendorNormalized)) activeByVendor.set(r.vendorNormalized, [])
    activeByVendor.get(r.vendorNormalized).push(r)
  }
  const unmatched = docs.filter(d => !d.matchedTransactionIds || d.matchedTransactionIds.length === 0)
  const candidates = unmatched.filter(d => activeByVendor.has(normalizeVendor(d.extractedVendor)))
  if (candidates.length > 0) {
    console.log(`\n=== Hint: unmatched docs whose vendor has an active rule (consider re-extraction) ===`)
    for (const d of candidates) {
      const v = normalizeVendor(d.extractedVendor)
      const fields = [...new Set(activeByVendor.get(v).map(r => r.field))].join(',')
      console.log(`  ${d.id}  "${d.originalFilename}"  vendor="${v}"  fields=${fields}`)
    }
    console.log(`  total: ${candidates.length}`)
  }
}

if (WRITE && ruleAdditions > 0) {
  const newBlob = { version: 1, lastModified: new Date().toISOString(), rules }
  const { error: updErr } = await supabase
    .from('app_data')
    .upsert({ key: 'vendorExtractionRules', value: newBlob, updated_at: new Date().toISOString() })
  if (updErr) { console.error('\nUPDATE ERROR:', updErr); process.exit(1) }
  console.log(`\nWrote ${rules.length} rules to Supabase.`)
}
