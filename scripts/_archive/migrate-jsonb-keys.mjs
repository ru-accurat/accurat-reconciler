#!/usr/bin/env node
/**
 * One-shot — Phase 0: rename inner JSONB keys so they match their outer
 * `app_data.key`. Removes the load-time `fetchKey('vendorAliases', 'aliases')`
 * indirection that was tripping up new code.
 *
 *   row vendorAliases       :  { aliases: [...] }       → { vendorAliases: [...] }
 *   row invoiceTemplates    :  { templates: [...] }     → { invoiceTemplates: [...] }
 *   row vendorExtractionRules: { rules: [...] }         → { vendorExtractionRules: [...] }
 *
 * Idempotent: if the row already has the new key, the row is left alone.
 *
 *   node scripts/_archive/migrate-jsonb-keys.mjs            # dry run
 *   node scripts/_archive/migrate-jsonb-keys.mjs --write    # apply
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

const RENAMES = [
  { row: 'vendorAliases',         from: 'aliases',   to: 'vendorAliases' },
  { row: 'invoiceTemplates',      from: 'templates', to: 'invoiceTemplates' },
  { row: 'vendorExtractionRules', from: 'rules',     to: 'vendorExtractionRules' },
]

let migrated = 0
let alreadyOk = 0
let notFound = 0

for (const { row, from, to } of RENAMES) {
  const { data, error } = await supabase.from('app_data').select('value').eq('key', row).single()
  if (error && error.code === 'PGRST116') {
    console.log(`  ${row}: row not found, skipping`)
    notFound++
    continue
  }
  if (error) {
    console.error(`  ${row}: fetch error`, error)
    process.exit(1)
  }
  const value = data?.value ?? {}
  if (Array.isArray(value[to])) {
    console.log(`  ${row}: already has '${to}' key (${value[to].length} items) — skipping`)
    alreadyOk++
    continue
  }
  if (!Array.isArray(value[from])) {
    console.log(`  ${row}: no '${from}' array found, nothing to rename`)
    continue
  }
  const items = value[from]
  const newValue = { ...value }
  newValue[to] = items
  delete newValue[from]
  console.log(`  ${row}: '${from}' → '${to}'  (${items.length} items)${WRITE ? '' : '  [dry run]'}`)
  if (WRITE) {
    const { error: upErr } = await supabase
      .from('app_data')
      .upsert({ key: row, value: newValue, updated_at: new Date().toISOString() })
    if (upErr) { console.error(`  ${row}: write error`, upErr); process.exit(1) }
  }
  migrated++
}

console.log()
console.log(`=== Summary ===`)
console.log(`  migrated:   ${migrated}`)
console.log(`  already ok: ${alreadyOk}`)
console.log(`  not found:  ${notFound}`)
console.log(`  mode:       ${WRITE ? 'WRITE' : 'DRY RUN — pass --write to apply'}`)
