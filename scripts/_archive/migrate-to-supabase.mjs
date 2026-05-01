#!/usr/bin/env node
/**
 * Migration script: Electron JSON data -> Supabase app_data table
 * 
 * Usage: 
 *   cd reconciler-web
 *   source .env.local
 *   node scripts/migrate-to-supabase.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars. Run:')
  console.error('  export $(cat .env.local | xargs) && node scripts/migrate-to-supabase.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const DATA_DIR = join(homedir(), 'Library', 'Application Support', 'Reconciler', 'data')

const FILES = ['transactions', 'contacts', 'categories', 'rules', 'documents', 'vendorAliases', 'settings']

async function migrate() {
  console.log('Reading data from: ' + DATA_DIR + '\n')

  for (const key of FILES) {
    const filePath = join(DATA_DIR, key + '.json')
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw)
      const { error } = await supabase
        .from('app_data')
        .upsert({ key, value: data, updated_at: new Date().toISOString() })
      if (error) {
        console.error('x ' + key + ': ' + error.message)
      } else {
        const kb = (Buffer.byteLength(raw, 'utf-8') / 1024).toFixed(1)
        const info = Array.isArray(data) ? data.length + ' items' : ''
        console.log('OK ' + key + ' - ' + kb + ' KB' + (info ? ' (' + info + ')' : ''))
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('-- ' + key + ': not found, skipping')
      } else {
        console.error('x ' + key + ': ' + err.message)
      }
    }
  }

  console.log('\nMigration complete!')
}

migrate()
