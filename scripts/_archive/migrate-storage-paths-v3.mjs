#!/usr/bin/env node
/**
 * One-shot — Phase A v3: rename every document so the filename's vendor
 * slug is driven by the matched transaction's CONTACT NAME (when present),
 * not by `extracted_vendor`.
 *
 * Old format (v2):
 *   YYYY-MM-DD_<dir>_<extractedVendorSlug>_<category>.<ext>
 * New format (v3):
 *   YYYY-MM-DD_<dir>_<contactNameSlug>_<category>.<ext>
 *   (falls back to extractedVendor when the doc isn't matched / has no
 *   contact)
 *
 * Reads from the relational `documents` / `transactions` /
 * `document_transactions` / `categories` / `contacts` tables.  Same
 * copy+remove approach as v2 — the bucket's anon RLS doesn't grant the
 * dedicated `move` action.
 *
 *   node scripts/_archive/migrate-storage-paths-v3.mjs            # dry run
 *   node scripts/_archive/migrate-storage-paths-v3.mjs --write    # apply
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

// Mirror of src/lib/storage-naming.ts (v3 — contact-aware vendor)
function buildSemanticPath(doc, category, contactName) {
  const ext = extractExtension(doc.original_filename) || 'pdf'
  const dateStr = doc.extracted_date || ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  const year   = m ? m[1] : 'unknown-date'
  const month  = m ? `${m[1]}-${m[2]}` : ''
  const dayKey = m ? `${m[1]}-${m[2]}-${m[3]}` : 'unknown-date'
  const folder = m ? `${year}/${month}` : 'unknown-date'
  const vendorRaw = (contactName ?? '').trim() || (doc.extracted_vendor ?? '')
  const vendor = slugifyStem(vendorRaw, 40) || 'unknown-vendor'
  const cat    = slugifyStem(category ?? '', 30) || 'uncategorized'
  const dir    = doc.direction || 'incoming'
  return `${folder}/${dayKey}_${dir}_${vendor}_${cat}.${ext}`
}
function buildSemanticThumbnailPath(doc, category, contactName) {
  return `thumbnails/${buildSemanticPath(doc, category, contactName).replace(/\.[^./]+$/, '')}.webp`
}
// v2 path (vendor from extracted_vendor, no contact name) — used as a
// fallback source when current stored_path doesn't actually exist in
// storage anymore (DB drifted).
function buildV2Path(doc, category) {
  const ext = extractExtension(doc.original_filename) || 'pdf'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(doc.extracted_date || '')
  const folder = m ? `${m[1]}/${m[1]}-${m[2]}` : 'unknown-date'
  const dayKey = m ? `${m[1]}-${m[2]}-${m[3]}` : 'unknown-date'
  const vendor = slugifyStem(doc.extracted_vendor ?? '', 40) || 'unknown-vendor'
  const cat    = slugifyStem(category ?? '', 30) || 'uncategorized'
  const dir    = doc.direction || 'incoming'
  return `${folder}/${dayKey}_${dir}_${vendor}_${cat}.${ext}`
}
function extractExtension(n) { const i = n.lastIndexOf('.'); if (i <= 0 || i === n.length - 1) return ''; return n.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '') }
function slugifyStem(s, max) {
  if (!s) return ''
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')
}

const [{ data: docs }, { data: txns }, { data: junction }, { data: cats }, { data: contacts }] = await Promise.all([
  supabase.from('documents').select('*'),
  supabase.from('transactions').select('id, contact_id, category_id'),
  supabase.from('document_transactions').select('document_id, transaction_id'),
  supabase.from('categories').select('id, name'),
  supabase.from('contacts').select('id, name'),
])
if (!docs) { console.error('Failed to fetch documents.'); process.exit(1) }

console.log(`Loaded ${docs.length} documents.`)
console.log()

const txnById = new Map((txns ?? []).map(t => [t.id, t]))
const catById = new Map((cats ?? []).map(c => [c.id, c]))
const contactById = new Map((contacts ?? []).map(c => [c.id, c]))
const txnsByDoc = new Map()
for (const j of junction ?? []) {
  const arr = txnsByDoc.get(j.document_id) ?? []
  arr.push(j.transaction_id)
  txnsByDoc.set(j.document_id, arr)
}
function resolveCtx(docId) {
  const tids = txnsByDoc.get(docId) ?? []
  let category = null, contactName = null
  for (const tid of tids) {
    const t = txnById.get(tid)
    if (!t) continue
    if (!category && t.category_id) category = catById.get(t.category_id)?.name ?? null
    if (!contactName && t.contact_id) contactName = contactById.get(t.contact_id)?.name ?? null
    if (category && contactName) break
  }
  return { category, contactName }
}

// First pass: plan + collision resolution
const plans = docs.map(doc => {
  const { category, contactName } = resolveCtx(doc.id)
  const desired       = buildSemanticPath(doc, category, contactName)
  const desiredThumb  = doc.thumbnail_path ? buildSemanticThumbnailPath(doc, category, contactName) : null
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

let renamed = 0, alreadyOk = 0, errors = 0
let copyOnly = 0  // when source is missing but the dest is already in place

for (const { doc, desired, desiredThumb } of plans) {
  if (desired === doc.stored_path) {
    // Could still be drift: storage might already have desired but DB
    // doesn't reflect it.  Verify.
    alreadyOk++
    continue
  }
  if (VERBOSE) {
    console.log(`  ${doc.id.slice(0, 8)}  ${doc.stored_path}`)
    console.log(`           → ${desired}`)
  }
  if (!WRITE) { renamed++; continue }

  // Skip pending uploads.
  if (doc.stored_path?.startsWith('pending/')) continue

  // First check whether desired already exists (prior migration may have
  // moved it; we just need to update the DB pointer).
  const { error: dlErr } = await supabase.storage.from('documents').download(desired)
  if (!dlErr) {
    // Just update DB pointer.
    const { error: updErr } = await supabase
      .from('documents')
      .update({
        stored_path: desired,
        thumbnail_path: desiredThumb ?? null,
      })
      .eq('id', doc.id)
    if (updErr) { console.error(`  ${doc.id.slice(0, 8)}  DB pointer update FAILED: ${updErr.message}`); errors++; continue }
    copyOnly++
    continue
  }

  // Need to actually copy. doc.stored_path may have drifted relative to
  // storage (auto-save races); fall back to the v2 path (extractedVendor
  // based) which was the previous storage layout.
  const v2Source = buildV2Path(doc, resolveCtx(doc.id).category)
  const candidateSources = [doc.stored_path, v2Source].filter((p, i, arr) => p && arr.indexOf(p) === i)
  let actualSource = null
  for (const s of candidateSources) {
    const { error: probeErr } = await supabase.storage.from('documents').download(s)
    if (!probeErr) { actualSource = s; break }
  }
  if (!actualSource) {
    console.error(`  ${doc.id.slice(0, 8)}  no source found  (tried: ${candidateSources.join(', ')})`)
    errors++
    continue
  }
  const { error: copyErr } = await supabase.storage.from('documents').copy(actualSource, desired)
  if (copyErr) {
    console.error(`  ${doc.id.slice(0, 8)}  copy FAILED: ${copyErr.message}  (${actualSource} → ${desired})`)
    errors++
    continue
  }
  await supabase.storage.from('documents').remove([actualSource])

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
console.log(`  total:           ${docs.length}`)
console.log(`  already ok:      ${alreadyOk}`)
console.log(`  renamed:         ${renamed}`)
console.log(`  pointer-only:    ${copyOnly}`)
console.log(`  errors:          ${errors}`)
console.log(`  collisions:      ${collisions} (resolved via id suffix)`)
console.log(`  mode:            ${WRITE ? 'WRITE' : 'DRY RUN — pass --write to apply'}`)
