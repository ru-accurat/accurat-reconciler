#!/usr/bin/env node
/**
 * Copies the pdfjs-dist web worker into public/ so it can be served as
 * a static asset. Runs as `postinstall` so the worker stays in sync
 * with the installed pdfjs-dist version.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const src = join(repoRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const dst = join(repoRoot, 'public', 'pdf.worker.min.mjs')

mkdirSync(dirname(dst), { recursive: true })
copyFileSync(src, dst)
console.log(`Copied pdfjs worker -> public/pdf.worker.min.mjs`)
