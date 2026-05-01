#!/usr/bin/env node
/**
 * One-shot backfill: re-derive DocumentRecord.direction using the new
 * line-based detectDirection logic. Replays detection against the cached
 * extractedText on each record — no PDF re-download.
 *
 *   node scripts/backfill-direction.mjs            # dry run
 *   node scripts/backfill-direction.mjs --write    # commit to Supabase
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

// Mirror of route.ts: outgoing iff the doc carries an Accurat-template marker.
const SELF_OUTGOING_MARKERS = [
  /\bzelle\s+to\s+gabriele\.rossi@accurat\.nyc\b/i,
]

function detectDirection(text) {
  if (!text) return 'incoming'
  for (const marker of SELF_OUTGOING_MARKERS) {
    if (marker.test(text)) return 'outgoing'
  }
  return 'incoming'
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
const counts = { 'incoming->outgoing': 0, 'outgoing->incoming': 0, unchanged: 0 }
const updated = docs.map(doc => {
  const oldDir = doc.direction
  const newDir = detectDirection(doc.extractedText || '')
  if (oldDir === newDir) { counts.unchanged++; return doc }
  changed++
  counts[`${oldDir}->${newDir}`] = (counts[`${oldDir}->${newDir}`] || 0) + 1
  console.log(`  ${doc.id.slice(0, 8)}  ${oldDir} -> ${newDir}  ${doc.originalFilename}`)
  return { ...doc, direction: newDir }
})

console.log(`\n=== Summary ===`)
console.log(`  total docs:            ${docs.length}`)
console.log(`  unchanged:             ${counts.unchanged}`)
console.log(`  incoming -> outgoing:  ${counts['incoming->outgoing']}`)
console.log(`  outgoing -> incoming:  ${counts['outgoing->incoming']}`)
console.log(`  total changed:         ${changed}`)
console.log(`  mode:                  ${WRITE ? 'WRITE (will update Supabase)' : 'DRY RUN (use --write to commit)'}`)

if (WRITE && changed > 0) {
  const newBlob = { ...blob, documents: updated, lastModified: new Date().toISOString() }
  const { error: updErr } = await supabase
    .from('app_data')
    .update({ value: newBlob, updated_at: new Date().toISOString() })
    .eq('key', 'documents')
  if (updErr) { console.error('\nUPDATE ERROR:', updErr); process.exit(1) }
  console.log(`\nWrote ${changed} updated documents to Supabase.`)
}
