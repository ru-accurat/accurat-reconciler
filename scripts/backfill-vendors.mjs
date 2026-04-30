#!/usr/bin/env node
/**
 * One-shot backfill: re-derive extractedVendor for existing DocumentRecords
 * after the route.ts fix that drops sublabel artifacts ("Attn", "Attention",
 * etc.) and self-references (Accurat) from the business-name list.
 *
 * Does NOT re-download PDFs or re-run pdf-parse — it only re-applies the
 * filtering logic to whatever entities are already stored on each record.
 *
 * Usage (from repo root):
 *   node scripts/backfill-vendors.mjs            # dry run
 *   node scripts/backfill-vendors.mjs --write    # actually update Supabase
 *
 * Read the dry-run output first. The diff shows old → new vendor per doc.
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

const SELF_ALIASES = [
  'accurat', 'accurat usa', 'accurat usa inc', 'accurat usa inc.',
  'accurat srl', 'accurat s.r.l.', 'accurat s.r.l',
]
const SELF_RE = new RegExp(
  `^\\s*(?:${SELF_ALIASES.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*$`,
  'i'
)
const isSelf = (n) => typeof n === 'string' && SELF_RE.test(n)

const SUBLABEL_STOPWORDS = new Set([
  'attn', 'attention', 'c/o', 'care of', 'to', 'from', 'bill', 'sold', 'ship',
  'mr', 'mrs', 'ms', 'dr',
])
const isSublabel = (n) => typeof n === 'string' && SUBLABEL_STOPWORDS.has(n.trim().toLowerCase())

// A vendor string that contains a currency symbol or a money-shaped number
// (e.g. "your last bill$925.75") is an extraction artifact from prose, never
// a real vendor name. Same for strings that are just digits or look like dates.
const isCurrencyArtifact = (n) =>
  typeof n === 'string' && (/[$£€¥]/.test(n) || /\d+\.\d{2}/.test(n))

const isBad = (n) => isSelf(n) || isSublabel(n) || isCurrencyArtifact(n)

// Only touch docs whose existing vendor is itself a sublabel or self artifact.
// We don't try to "improve" merely-messy vendors here — that's a different fix.
// We also won't write null over a bad-but-existing string (that's strictly worse).
function recomputeVendor(doc) {
  const oldVendor = doc.extractedVendor
  if (!isBad(oldVendor)) return null  // signal: skip this doc

  const ents = doc.extractedEntities || { businessNames: [], personNames: [] }
  const cleanedBusinesses = (ents.businessNames || []).filter(n => !isBad(n))
  const cleanedPersons    = (ents.personNames    || []).filter(n => !isBad(n))

  let newVendor = null
  if (cleanedBusinesses.length > 0)      newVendor = cleanedBusinesses[0]
  else if (cleanedPersons.length > 0)    newVendor = cleanedPersons[0]

  if (newVendor === null) return null  // can't improve; leave alone

  return { vendor: newVendor, cleanedBusinesses, cleanedPersons }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const { data: row, error } = await supabase.from('app_data').select('value').eq('key', 'documents').single()
if (error) { console.error('FETCH ERROR:', error); process.exit(1) }

const blob = row.value
const docs = blob.documents || []

let changed = 0
const updated = docs.map(doc => {
  const result = recomputeVendor(doc)
  if (result === null) return doc

  const { vendor: newVendor, cleanedBusinesses, cleanedPersons } = result
  const oldVendor = doc.extractedVendor ?? null
  const oldBusinesses = doc.extractedEntities?.businessNames ?? []
  const oldPersons    = doc.extractedEntities?.personNames    ?? []

  changed++
  console.log(`\n${doc.id}  ${doc.originalFilename}`)
  console.log(`  vendor:    "${oldVendor}" -> "${newVendor}"`)
  if (oldBusinesses.length !== cleanedBusinesses.length) {
    console.log(`  business:  ${JSON.stringify(oldBusinesses)} -> ${JSON.stringify(cleanedBusinesses)}`)
  }
  if (oldPersons.length !== cleanedPersons.length) {
    console.log(`  persons:   ${JSON.stringify(oldPersons)} -> ${JSON.stringify(cleanedPersons)}`)
  }
  return {
    ...doc,
    extractedVendor: newVendor,
    extractedEntities: {
      ...(doc.extractedEntities || {}),
      businessNames: cleanedBusinesses,
      personNames:   cleanedPersons,
    },
  }
})

console.log(`\n=== Summary ===`)
console.log(`  total:    ${docs.length}`)
console.log(`  changed:  ${changed}`)
console.log(`  unchanged: ${docs.length - changed}`)
console.log(`  mode:     ${WRITE ? 'WRITE (will update Supabase)' : 'DRY RUN (use --write to commit)'}`)

if (WRITE && changed > 0) {
  const newBlob = { ...blob, documents: updated, lastModified: new Date().toISOString() }
  const { error: updErr } = await supabase
    .from('app_data')
    .update({ value: newBlob, updated_at: new Date().toISOString() })
    .eq('key', 'documents')
  if (updErr) { console.error('\nUPDATE ERROR:', updErr); process.exit(1) }
  console.log(`\nWrote ${changed} updated documents to Supabase.`)
}
