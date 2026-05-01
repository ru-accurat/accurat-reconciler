import type { DocumentRecord } from '@/lib/types'

/**
 * Compute the semantic storage path for a document — what it *should* be
 * named based on its current tagging.  The result is a slash-separated key
 * (no leading slash) suitable for `supabase.storage.from('documents')`.
 *
 * Layout:
 *   documents/<YYYY>/<YYYY-MM>/<YYYY-MM-DD>_<direction>_<vendor>_<category>.<ext>
 *
 * Falls back to `unknown-date`, `unknown-vendor`, `uncategorized` when a
 * field is missing.  `unknown-date` files cluster under
 * `documents/unknown-date/`.
 *
 * Note: the original uploaded filename is intentionally NOT part of the
 * stored path — every doc gets a fresh, semantically meaningful name on
 * upload (or on first tag edit).  This keeps the file manager view
 * useful: every file's name self-describes what it is.
 */
export interface SemanticContext {
  /** Resolved category name for the doc's match (if any). */
  category?: string | null
  /**
   * Resolved client/vendor display name from the matched transaction's
   * contact.  When present, this is preferred over `doc.extractedVendor`
   * for the filename — the user-facing contact name is canonical, the
   * extracted vendor is whatever the PDF parser pulled out.
   */
  contactName?: string | null
}

export function buildSemanticPath(doc: DocumentRecord, ctx: SemanticContext = {}): string {
  const ext = extractExtension(doc.originalFilename) || 'pdf'
  const dateStr = doc.extractedDate || ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)

  const year   = m ? m[1] : 'unknown-date'
  const month  = m ? `${m[1]}-${m[2]}` : ''
  const dayKey = m ? `${m[1]}-${m[2]}-${m[3]}` : 'unknown-date'

  const folder   = m ? `${year}/${month}` : 'unknown-date'
  // Prefer the matched contact's name over extractedVendor so the file
  // name lines up with what the user sees in the UI for that contact.
  const vendorRaw = ctx.contactName?.trim() || doc.extractedVendor || ''
  const vendor   = slugifyStem(vendorRaw, 40) || 'unknown-vendor'
  const category = slugifyStem(ctx.category ?? '', 30) || 'uncategorized'
  const dir      = doc.direction || 'incoming'

  const filename = `${dayKey}_${dir}_${vendor}_${category}.${ext}`
  return `${folder}/${filename}`
}

/**
 * Thumbnail path is intentionally docId-based, NOT semantic.  Keeping it
 * stable means renames of the source PDF never break thumbnails (and
 * ensures the lazy-generation cache key matches whatever's in storage).
 */
export function buildSemanticThumbnailPath(doc: DocumentRecord, _ctx: SemanticContext = {}): string {
  return `thumbnails/${doc.id}.webp`
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
