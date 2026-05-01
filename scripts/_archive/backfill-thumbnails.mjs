#!/usr/bin/env node
/**
 * One-shot backfill: reconcile DocumentRecord.thumbnailPath against
 * what's actually in Supabase Storage at thumbnails/<docId>.webp.
 *
 * Need: when many docs lazy-generate thumbnails in a burst, the auto-save
 * debounce keeps resetting and the user often closes the tab before the
 * final flush. Storage uploads succeed independently, so we end up with
 * orphan thumbnail files and unset thumbnailPath fields. This script
 * heals the resulting state.
 *
 *   node scripts/backfill-thumbnails.mjs            # dry run
 *   node scripts/backfill-thumbnails.mjs --write    # commit to Supabase
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const { data: row, error: fetchErr } = await supabase
  .from('app_data').select('value').eq('key', 'documents').single()
if (fetchErr) { console.error('FETCH ERROR:', fetchErr); process.exit(1) }

const blob = row.value
const docs = blob.documents || []

const thumbsByDocId = new Map()
let pageOffset = 0
while (true) {
  const { data: page, error: listErr } = await supabase.storage
    .from('documents').list('thumbnails', { limit: 100, offset: pageOffset })
  if (listErr) { console.error('LIST ERROR:', listErr); process.exit(1) }
  if (!page || page.length === 0) break
  for (const f of page) {
    const m = f.name.match(/^([0-9a-f-]{36})\.webp$/i)
    if (m) thumbsByDocId.set(m[1], `thumbnails/${f.name}`)
  }
  if (page.length < 100) break
  pageOffset += 100
}

let changed = 0
const updated = docs.map(doc => {
  const path = thumbsByDocId.get(doc.id)
  if (!path) return doc
  if (doc.thumbnailPath === path) return doc
  changed++
  console.log(`  ${doc.id}  ${doc.originalFilename}`)
  console.log(`    "${doc.thumbnailPath ?? '(unset)'}" -> "${path}"`)
  return { ...doc, thumbnailPath: path }
})

console.log(`\n=== Summary ===`)
console.log(`  total docs:           ${docs.length}`)
console.log(`  thumbnails in store:  ${thumbsByDocId.size}`)
console.log(`  records updated:      ${changed}`)
console.log(`  mode:                 ${WRITE ? 'WRITE (will update Supabase)' : 'DRY RUN (use --write to commit)'}`)

const orphans = [...thumbsByDocId.keys()].filter(id => !docs.some(d => d.id === id))
if (orphans.length) {
  console.log(`\n  orphan thumbnails (no matching doc): ${orphans.length}`)
  for (const id of orphans.slice(0, 10)) console.log(`    ${id}`)
}

if (WRITE && changed > 0) {
  const newBlob = { ...blob, documents: updated, lastModified: new Date().toISOString() }
  const { error: updErr } = await supabase
    .from('app_data')
    .update({ value: newBlob, updated_at: new Date().toISOString() })
    .eq('key', 'documents')
  if (updErr) { console.error('\nUPDATE ERROR:', updErr); process.exit(1) }
  console.log(`\nWrote ${changed} updated documents to Supabase.`)
}
