#!/usr/bin/env node
/**
 * One-shot — Phase 2: rename every existing document in Supabase Storage
 * from its legacy `${timestamp}-${original}.pdf` path to the new semantic
 * `YYYY/YYYY-MM/YYYY-MM-DD_<dir>_<vendor>_<amount>_<stem>.<ext>` path.
 *
 * Reads the documents blob from app_data, computes the desired path for
 * each doc using the same algorithm as src/lib/storage-naming.ts (mirror
 * kept here intentionally — node script can't import from `@/lib`),
 * calls Supabase Storage `move()` for the doc + its thumbnail, and
 * updates the JSONB blob with new `storedPath` / `thumbnailPath` /
 * `historicalPaths` fields.
 *
 *   node scripts/_archive/migrate-storage-paths.mjs            # dry run
 *   node scripts/_archive/migrate-storage-paths.mjs --write    # apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const WRITE = process.argv.includes('--write')
const VERBOSE = process.argv.includes('--verbose')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ---- Mirrored from src/lib/storage-naming.ts ----
function buildSemanticPath(doc) {
  const ext = extractExtension(doc.originalFilename) || 'pdf'
  const stem = slugifyStem(stripExtension(doc.originalFilename) || 'document', 32)
  const dateStr = doc.extractedDate || ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  const year   = m ? m[1] : 'unknown-date'
  const month  = m ? `${m[1]}-${m[2]}` : ''
  const dayKey = m ? `${m[1]}-${m[2]}-${m[3]}` : 'unknown-date'
  const folder = m ? `${year}/${month}` : 'unknown-date'
  const vendor = slugifyStem(doc.extractedVendor ?? '', 40) || 'unknown-vendor'
  const amount = formatAmount(doc.extractedAmount)
  const dir    = doc.direction || 'incoming'
  return `${folder}/${dayKey}_${dir}_${vendor}_${amount}_${stem}.${ext}`
}
function buildSemanticThumbnailPath(doc) {
  return `thumbnails/${buildSemanticPath(doc).replace(/\.[^./]+$/, '')}.webp`
}
function stripExtension(n) { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n }
function extractExtension(n) { const i = n.lastIndexOf('.'); if (i <= 0 || i === n.length - 1) return ''; return n.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '') }
function slugifyStem(s, max) {
  if (!s) return ''
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')
}
function formatAmount(a) { return (a == null || Number.isNaN(a)) ? 'unknown-amount' : a.toFixed(2) }

// ---- Main ----
const { data: docsRow, error: dErr } = await supabase
  .from('app_data').select('value').eq('key', 'documents').single()
if (dErr) { console.error('FETCH ERROR:', dErr); process.exit(1) }

const docsBlob = docsRow.value
const docs = docsBlob.documents || []
console.log(`Loaded ${docs.length} documents from app_data.`)
console.log()

let renamed = 0
let alreadyOk = 0
let errors = 0
let collisions = 0
const updatedDocs = []
const usedPaths = new Set()

// First pass: gather all docs that need a rename, detect destination collisions.
const plans = docs.map(doc => {
  const desired = buildSemanticPath(doc)
  const desiredThumb = doc.thumbnailPath ? buildSemanticThumbnailPath(doc) : null
  return { doc, desired, desiredThumb }
})
// Append (1), (2), ... when two docs would collide on the desired path.
const counts = new Map()
for (const p of plans) {
  const c = counts.get(p.desired) || 0
  counts.set(p.desired, c + 1)
}
for (const p of plans) {
  if ((counts.get(p.desired) || 0) > 1) {
    // distinguish by appending the doc's id-prefix
    const idTag = p.doc.id.slice(0, 8)
    const dot = p.desired.lastIndexOf('.')
    p.desired = `${p.desired.slice(0, dot)}_${idTag}${p.desired.slice(dot)}`
    if (p.desiredThumb) {
      const dotT = p.desiredThumb.lastIndexOf('.')
      p.desiredThumb = `${p.desiredThumb.slice(0, dotT)}_${idTag}${p.desiredThumb.slice(dotT)}`
    }
    collisions++
  }
}

for (const { doc, desired, desiredThumb } of plans) {
  if (desired === doc.storedPath) {
    alreadyOk++
    updatedDocs.push(doc)
    continue
  }
  if (VERBOSE) {
    console.log(`  ${doc.id.slice(0, 8)}  ${doc.storedPath}`)
    console.log(`           → ${desired}`)
  }
  if (!WRITE) {
    updatedDocs.push(doc)
    renamed++
    continue
  }
  // copy + remove instead of move(): the anon-key RLS policy on this bucket
  // doesn't grant the move storage action, but does allow insert and delete.
  const { error: copyErr } = await supabase.storage.from('documents').copy(doc.storedPath, desired)
  if (copyErr) {
    console.error(`  ${doc.id.slice(0, 8)}  FAILED: ${copyErr.message}  (${doc.storedPath} → ${desired})`)
    errors++
    updatedDocs.push(doc)
    continue
  }
  const { error: removeErr } = await supabase.storage.from('documents').remove([doc.storedPath])
  if (removeErr) {
    console.warn(`  ${doc.id.slice(0, 8)}  copied but old file not removed: ${removeErr.message}`)
  }
  let newThumbPath = doc.thumbnailPath ?? null
  if (doc.thumbnailPath && desiredThumb && desiredThumb !== doc.thumbnailPath) {
    const { error: thumbCopyErr } = await supabase.storage.from('documents').copy(doc.thumbnailPath, desiredThumb)
    if (thumbCopyErr) {
      console.error(`  ${doc.id.slice(0, 8)}  thumbnail copy failed (${thumbCopyErr.message}); unsetting`)
      newThumbPath = null
    } else {
      await supabase.storage.from('documents').remove([doc.thumbnailPath])
      newThumbPath = desiredThumb
    }
  }
  updatedDocs.push({
    ...doc,
    storedPath: desired,
    thumbnailPath: newThumbPath,
    historicalPaths: [...(doc.historicalPaths ?? []), doc.storedPath],
  })
  renamed++
}

console.log()
console.log(`=== Summary ===`)
console.log(`  total:       ${docs.length}`)
console.log(`  renamed:     ${renamed}`)
console.log(`  already ok:  ${alreadyOk}`)
console.log(`  errors:      ${errors}`)
console.log(`  collisions:  ${collisions} (resolved via id suffix)`)
console.log(`  mode:        ${WRITE ? 'WRITE' : 'DRY RUN — pass --write to apply'}`)

if (WRITE && renamed > 0) {
  const newBlob = { ...docsBlob, documents: updatedDocs, lastModified: new Date().toISOString() }
  const { error: upErr } = await supabase
    .from('app_data')
    .update({ value: newBlob, updated_at: new Date().toISOString() })
    .eq('key', 'documents')
  if (upErr) { console.error('UPDATE ERROR:', upErr); process.exit(1) }
  console.log(`Wrote ${renamed} updated documents to Supabase.`)
}
