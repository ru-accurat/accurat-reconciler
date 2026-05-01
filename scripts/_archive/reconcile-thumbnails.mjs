#!/usr/bin/env node
/**
 * One-shot — reconcile thumbnails to the canonical docId-based path.
 *
 * History: thumbnails were originally written to `thumbnails/<docId>.webp`,
 * then v2 and v3 migrations also moved them to semantic paths
 * (`thumbnails/YYYY/YYYY-MM/<dayKey>_<dir>_<vendor>_<cat>.webp`) — the
 * resulting drift means many in-app thumbnail URLs 404.
 *
 * This script walks every doc and:
 *   1. Looks for a thumbnail at `thumbnails/<docId>.webp`. If found → done.
 *   2. Otherwise tries the semantic v2 + v3 paths.  When found, copies it
 *      to `<docId>.webp` and removes the orphan.
 *   3. Updates DB row's `thumbnail_path` to the canonical value.
 *
 * After this, leftover orphan thumbnails (no matching doc) are deleted.
 *
 *   node scripts/_archive/reconcile-thumbnails.mjs            # dry run
 *   node scripts/_archive/reconcile-thumbnails.mjs --write    # apply
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
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function slug(s, max) {
  if (!s) return ''
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')
}
function buildSemanticThumb(doc, category, contactName) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(doc.extracted_date || '')
  const folder = m ? `${m[1]}/${m[1]}-${m[2]}` : 'unknown-date'
  const dayKey = m ? `${m[1]}-${m[2]}-${m[3]}` : 'unknown-date'
  const vendorRaw = (contactName ?? '').trim() || (doc.extracted_vendor ?? '')
  const vendor = slug(vendorRaw, 40) || 'unknown-vendor'
  const cat    = slug(category ?? '', 30) || 'uncategorized'
  const dir    = doc.direction || 'incoming'
  return `thumbnails/${folder}/${dayKey}_${dir}_${vendor}_${cat}.webp`
}

async function listAll(prefix) {
  let all = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from('documents').list(prefix, { limit: 1000, offset })
    if (error) { console.error('list err', error); return all }
    if (!data || data.length === 0) break
    for (const f of data) {
      if (f.id) all.push((prefix ? prefix + '/' : '') + f.name)
      else { const sub = await listAll((prefix ? prefix + '/' : '') + f.name); all = all.concat(sub) }
    }
    if (data.length < 1000) break
    offset += data.length
  }
  return all
}

const [{ data: docs }, { data: txns }, { data: junction }, { data: cats }, { data: contacts }] = await Promise.all([
  supabase.from('documents').select('id, extracted_date, extracted_vendor, direction'),
  supabase.from('transactions').select('id, contact_id, category_id'),
  supabase.from('document_transactions').select('document_id, transaction_id'),
  supabase.from('categories').select('id, name'),
  supabase.from('contacts').select('id, name'),
])
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

const allThumbs = new Set(await listAll('thumbnails'))
console.log(`Total thumbnail files: ${allThumbs.size}`)
console.log(`Total docs: ${docs.length}`)

let alreadyOk = 0, recovered = 0, regenNeeded = 0, errors = 0
const claimedOrphans = new Set()

for (const doc of docs) {
  const canonical = `thumbnails/${doc.id}.webp`
  if (allThumbs.has(canonical)) {
    alreadyOk++
    if (WRITE) {
      // Make sure DB points at the canonical path.
      await supabase.from('documents').update({ thumbnail_path: canonical }).eq('id', doc.id)
    }
    continue
  }
  // Try v2 (extractedVendor) and v3 (contactName) candidates.
  const ctx = resolveCtx(doc.id)
  const v2 = buildSemanticThumb(doc, ctx.category, null)
  const v3 = buildSemanticThumb(doc, ctx.category, ctx.contactName)
  const candidate = [v3, v2].find(p => allThumbs.has(p))
  if (!candidate) {
    regenNeeded++
    if (WRITE) {
      // Clear any stale DB pointer so the next view triggers regeneration.
      await supabase.from('documents').update({ thumbnail_path: null }).eq('id', doc.id)
    }
    continue
  }
  if (!WRITE) { recovered++; claimedOrphans.add(candidate); continue }
  const { error: copyErr } = await supabase.storage.from('documents').copy(candidate, canonical)
  if (copyErr) {
    console.error(`  ${doc.id.slice(0, 8)}  copy FAILED: ${copyErr.message}`)
    errors++
    continue
  }
  await supabase.storage.from('documents').remove([candidate])
  await supabase.from('documents').update({ thumbnail_path: canonical }).eq('id', doc.id)
  recovered++
  claimedOrphans.add(candidate)
}

// Remaining orphans: not claimed by any doc
const remainingOrphans = [...allThumbs].filter(p => {
  const m = /^thumbnails\/([0-9a-f-]{36})\.webp$/.exec(p)
  if (m && docs.some(d => d.id === m[1])) return false  // canonical for an existing doc
  if (claimedOrphans.has(p)) return false
  return true
})
console.log()
console.log(`Orphans to delete: ${remainingOrphans.length}`)
if (WRITE && remainingOrphans.length > 0) {
  for (let i = 0; i < remainingOrphans.length; i += 100) {
    const chunk = remainingOrphans.slice(i, i + 100)
    await supabase.storage.from('documents').remove(chunk)
  }
  console.log(`Deleted ${remainingOrphans.length} orphan thumbnails`)
}

console.log()
console.log(`=== Summary ===`)
console.log(`  already canonical:   ${alreadyOk}`)
console.log(`  recovered (moved):   ${recovered}`)
console.log(`  needs regen:         ${regenNeeded}`)
console.log(`  errors:              ${errors}`)
console.log(`  orphans removed:     ${remainingOrphans.length}`)
console.log(`  mode:                ${WRITE ? 'WRITE' : 'DRY RUN — pass --write to apply'}`)
