#!/usr/bin/env node
/**
 * One-shot — Phase 2 v2: rename every document to the *new* naming scheme.
 *
 * Old format (Phase 2 v1):
 *   YYYY/YYYY-MM/YYYY-MM-DD_<dir>_<vendor>_<amount>_<original-stem>.<ext>
 *
 * New format:
 *   YYYY/YYYY-MM/YYYY-MM-DD_<dir>_<vendor>_<category>.<ext>
 *
 * Reads from the relational `documents` / `transactions` /
 * `document_transactions` / `categories` tables (Phase 4).  Same
 * copy+remove approach for the move because the bucket's anon RLS
 * doesn't grant the dedicated `move` action.  Updates `stored_path`,
 * `thumbnail_path`, and `historical_paths` directly on the row.
 *
 *   node scripts/_archive/migrate-storage-paths-v2.mjs            # dry run
 *   node scripts/_archive/migrate-storage-paths-v2.mjs --write    # apply
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

// ---- Mirror of src/lib/storage-naming.ts ----
function buildSemanticPath(doc, category) {
  const ext = extractExtension(doc.original_filename) || 'pdf'
  const dateStr = doc.extracted_date || ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  const year   = m ? m[1] : 'unknown-date'
  const month  = m ? `${m[1]}-${m[2]}` : ''
  const dayKey = m ? `${m[1]}-${m[2]}-${m[3]}` : 'unknown-date'
  const folder = m ? `${year}/${month}` : 'unknown-date'
  const vendor = slugifyStem(doc.extracted_vendor ?? '', 40) || 'unknown-vendor'
  const cat    = slugifyStem(category ?? '', 30) || 'uncategorized'
  const dir    = doc.direction || 'incoming'
  return `${folder}/${dayKey}_${dir}_${vendor}_${cat}.${ext}`
}
function buildSemanticThumbnailPath(doc, category) {
  return `thumbnails/${buildSemanticPath(doc, category).replace(/\.[^./]+$/, '')}.webp`
}
function extractExtension(n) { const i = n.lastIndexOf('.'); if (i <= 0 || i === n.length - 1) return ''; return n.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '') }
function slugifyStem(s, max) {
  if (!s) return ''
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')
}

// ---- Fetch state from relational tables ----
const [{ data: docs }, { data: txns }, { data: junction }, { data: cats }] = await Promise.all([
  supabase.from('documents').select('*'),
  supabase.from('transactions').select('id, contact_id, category_id'),
  supabase.from('document_transactions').select('document_id, transaction_id'),
  supabase.from('categories').select('id, name'),
])
if (!docs) { console.error('Failed to fetch documents.'); process.exit(1) }

console.log(`Loaded ${docs.length} documents.`)
console.log()

const txnById = new Map((txns ?? []).map(t => [t.id, t]))
const catById = new Map((cats ?? []).map(c => [c.id, c]))
const txnsByDoc = new Map()
for (const j of junction ?? []) {
  const arr = txnsByDoc.get(j.document_id) ?? []
  arr.push(j.transaction_id)
  txnsByDoc.set(j.document_id, arr)
}

function categoryFor(docId) {
  const tids = txnsByDoc.get(docId) ?? []
  for (const tid of tids) {
    const txn = txnById.get(tid)
    if (txn?.category_id) {
      return catById.get(txn.category_id)?.name ?? null
    }
  }
  return null
}

// ---- First pass: plan + collision resolution ----
const plans = docs.map(doc => {
  const category = categoryFor(doc.id)
  const desired       = buildSemanticPath(doc, category)
  const desiredThumb  = doc.thumbnail_path ? buildSemanticThumbnailPath(doc, category) : null
  return { doc, desired, desiredThumb }
})

const counts = new Map()
for (const p of plans) counts.set(p.desired, (counts.get(p.desired) || 0) + 1)
let collisions = 0
for (const p of plans) {
  if ((counts.get(p.desired) || 0) > 1) {
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

// ---- Second pass: copy+remove + DB update ----
let renamed = 0, alreadyOk = 0, errors = 0

for (const { doc, desired, desiredThumb } of plans) {
  if (desired === doc.stored_path) {
    alreadyOk++
    continue
  }
  if (VERBOSE) {
    console.log(`  ${doc.id.slice(0, 8)}  ${doc.stored_path}`)
    console.log(`           → ${desired}`)
  }
  if (!WRITE) { renamed++; continue }
  const { error: copyErr } = await supabase.storage.from('documents').copy(doc.stored_path, desired)
  if (copyErr) {
    console.error(`  ${doc.id.slice(0, 8)}  FAILED: ${copyErr.message}`)
    errors++
    continue
  }
  const { error: removeErr } = await supabase.storage.from('documents').remove([doc.stored_path])
  if (removeErr) console.warn(`  ${doc.id.slice(0, 8)}  copied but old file lingered: ${removeErr.message}`)

  let newThumbPath = doc.thumbnail_path ?? null
  if (doc.thumbnail_path && desiredThumb && desiredThumb !== doc.thumbnail_path) {
    const { error: thumbCopyErr } = await supabase.storage.from('documents').copy(doc.thumbnail_path, desiredThumb)
    if (thumbCopyErr) {
      newThumbPath = null
    } else {
      await supabase.storage.from('documents').remove([doc.thumbnail_path])
      newThumbPath = desiredThumb
    }
  }

  const { error: updErr } = await supabase
    .from('documents')
    .update({
      stored_path: desired,
      thumbnail_path: newThumbPath,
      historical_paths: [...(doc.historical_paths ?? []), doc.stored_path],
    })
    .eq('id', doc.id)
  if (updErr) {
    console.error(`  ${doc.id.slice(0, 8)}  DB update FAILED: ${updErr.message}`)
    errors++
    continue
  }
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
