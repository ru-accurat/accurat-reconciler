import type { DocumentRecord } from '@/lib/types'

/**
 * Compute the semantic storage path for a document — what it *should* be
 * named based on its current tagging.  The result is a slash-separated key
 * (no leading slash) suitable for `supabase.storage.from('documents')`.
 *
 * Layout:
 *   documents/<YYYY>/<YYYY-MM>/<YYYY-MM-DD>_<direction>_<vendor>_<amount>_<stem>.<ext>
 *
 * Falls back to `unknown-date`, `unknown-vendor`, `unknown-amount` when a
 * field is missing.  `unknown-date` files cluster under
 * `documents/unknown-date/`.
 */
export function buildSemanticPath(doc: DocumentRecord): string {
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

  const filename = `${dayKey}_${dir}_${vendor}_${amount}_${stem}.${ext}`
  return `${folder}/${filename}`
}

/** Computed thumbnail path that mirrors the document's semantic path. */
export function buildSemanticThumbnailPath(doc: DocumentRecord): string {
  const docPath = buildSemanticPath(doc)
  // strip extension, append `.webp`, prefix `thumbnails/`
  const noExt = docPath.replace(/\.[^./]+$/, '')
  return `thumbnails/${noExt}.webp`
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

function extractExtension(name: string): string {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return ''
  return name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Lower-kebab-case slug that's safe for Supabase Storage keys (URL path
 * segments).  Strips diacritics, replaces non-alphanumerics with `-`,
 * collapses runs, trims to `maxLen`.
 */
function slugifyStem(input: string, maxLen: number): string {
  if (!input) return ''
  return input
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/, '')
}

function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return 'unknown-amount'
  // Two decimals, no thousands separator — keeps filenames lexicographically sortable
  // and free of commas (which Supabase Storage rejects in some clients).
  return amount.toFixed(2)
}
