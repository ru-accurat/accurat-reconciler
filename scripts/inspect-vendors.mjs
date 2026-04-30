#!/usr/bin/env node
/**
 * Diagnostic: pull all DocumentRecords from Supabase, audit extractedVendor
 * values, dump the raw pdf-parse text for the most suspicious cases.
 *
 * Usage (from repo root):
 *   node scripts/inspect-vendors.mjs
 *
 * Reads Supabase creds from .env.local. Read-only — no writes.
 */
import { createClient } from '@supabase/supabase-js'
import pdf from 'pdf-parse'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envText = readFileSync(envPath, 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const { data, error } = await supabase.from('app_data').select('value').eq('key', 'documents').single()
if (error) { console.error('FETCH ERROR:', error); process.exit(1) }

const docs = data.value.documents || []
console.log(`Total documents: ${docs.length}\n`)

const vendorCounts = new Map()
for (const d of docs) {
  const v = d.extractedVendor ?? '(null)'
  vendorCounts.set(v, (vendorCounts.get(v) || 0) + 1)
}
const sorted = [...vendorCounts.entries()].sort((a,b) => b[1]-a[1])
console.log('=== All distinct extracted vendors (count | value) ===')
for (const [v, c] of sorted) console.log(`  ${c.toString().padStart(3)} | ${v}`)

const SUSPICIOUS = /\battn\b|\battention\b|^bill\s+to|^sold\s+to|^from\b|^to\b|^mr\.|^mrs\.|^ms\.|^dr\./i
const suspicious = docs.filter(d => d.extractedVendor && SUSPICIOUS.test(d.extractedVendor))
console.log(`\n=== Suspicious vendor strings (${suspicious.length} docs) ===`)
for (const d of suspicious) {
  console.log(`  ${d.id} | dir=${d.direction} | vendor="${d.extractedVendor}" | file=${d.originalFilename}`)
}

console.log('\n=== PDF text dumps for first 3 suspicious docs ===')
for (const d of suspicious.slice(0, 3)) {
  console.log(`\n----- ${d.id} (vendor="${d.extractedVendor}", direction=${d.direction}) -----`)
  console.log(`  file: ${d.originalFilename}`)
  console.log(`  storedPath: ${d.storedPath}`)
  const { data: file, error: dlErr } = await supabase.storage.from('documents').download(d.storedPath)
  if (dlErr) { console.log(`  download error: ${dlErr.message}`); continue }
  const buf = Buffer.from(await file.arrayBuffer())
  try {
    const parsed = await pdf(buf)
    const txt = parsed.text
    console.log(`  total chars: ${txt.length}`)
    console.log(`  entities.businessNames stored: ${JSON.stringify(d.extractedEntities?.businessNames || [])}`)
    console.log(`  entities.personNames   stored: ${JSON.stringify(d.extractedEntities?.personNames   || [])}`)
    console.log(`  --- first 1500 chars of extracted text ---`)
    console.log(txt.slice(0, 1500))
    console.log(`  --- end ---`)
  } catch (e) {
    console.log(`  pdf-parse error: ${e.message}`)
  }
}

console.log('\n=== Outgoing invoices (Accurat-issued) — vendor breakdown ===')
const outgoing = docs.filter(d => d.direction === 'outgoing')
console.log(`  count: ${outgoing.length}`)
for (const d of outgoing.slice(0, 50)) {
  console.log(`  ${d.id.slice(0,8)} | "${d.extractedVendor}" | ${d.originalFilename}`)
}
