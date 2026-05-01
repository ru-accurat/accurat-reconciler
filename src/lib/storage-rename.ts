import { supabase } from '@/lib/supabase'
import type { DocumentRecord } from '@/lib/types'
import { buildSemanticPath, buildSemanticThumbnailPath } from '@/lib/storage-naming'

/**
 * If `doc.storedPath` no longer matches its semantic path (because a tag
 * field changed — direction / vendor / date / amount), move the storage
 * object to the new path and return the patch to apply to the doc record.
 *
 * Returns `null` when nothing needed to change.  Errors are surfaced to
 * the caller; they should toast and back off rather than retry forever.
 *
 * Implementation detail: Supabase's storage API doesn't have an atomic
 * `move`, but `move()` from the JS client does the equivalent (copy +
 * delete behind the scenes).  Thumbnails are renamed as a separate call
 * so a thumbnail-rename failure doesn't block the doc rename.
 */
export async function renameDocumentStorageIfNeeded(
  doc: DocumentRecord
): Promise<Partial<DocumentRecord> | null> {
  const desired = buildSemanticPath(doc)
  if (desired === doc.storedPath) return null

  // Copy + remove instead of `move()`.  Reason: this bucket's RLS policy
  // grants the anon key INSERT and DELETE rights, but not the dedicated
  // `move` storage action — `move()` returns 404 even though the source
  // file exists.  copy+remove decomposes the operation into two policy
  // checks the anon role does pass.
  const { error: copyErr } = await supabase
    .storage
    .from('documents')
    .copy(doc.storedPath, desired)
  if (copyErr) {
    throw new Error(`Storage copy failed (${doc.storedPath} → ${desired}): ${copyErr.message}`)
  }
  const { error: removeErr } = await supabase
    .storage
    .from('documents')
    .remove([doc.storedPath])
  if (removeErr) {
    // The new file is in place, the old one isn't gone.  Not catastrophic
    // (publicUrl now points at the new file via storedPath patch), but
    // log it — over time these would accumulate as orphans.
    console.warn(`Storage rename: copy succeeded but old object lingered: ${doc.storedPath}`, removeErr)
  }

  const patch: Partial<DocumentRecord> = {
    storedPath: desired,
    historicalPaths: [...(doc.historicalPaths ?? []), doc.storedPath],
  }

  // Move the thumbnail too, when one exists.  A failed thumbnail move just
  // unsets the path — the next viewer will regenerate it.
  if (doc.thumbnailPath) {
    const desiredThumb = buildSemanticThumbnailPath(doc)
    if (desiredThumb !== doc.thumbnailPath) {
      const { error: thumbCopyErr } = await supabase
        .storage
        .from('documents')
        .copy(doc.thumbnailPath, desiredThumb)
      if (thumbCopyErr) {
        patch.thumbnailPath = null
      } else {
        await supabase.storage.from('documents').remove([doc.thumbnailPath])
        patch.thumbnailPath = desiredThumb
      }
    }
  }

  return patch
}

/**
 * Tag fields that, when changed, should trigger a rename.  Used by the
 * subscription in AppShell to decide whether a doc's update is worth
 * inspecting for a rename.
 */
export const RENAME_TRIGGER_FIELDS: ReadonlyArray<keyof DocumentRecord> = [
  'extractedDate',
  'extractedVendor',
  'extractedAmount',
  'direction',
  'originalFilename',
]

/**
 * Compact signature of a doc's rename-trigger fields; if two snapshots
 * have the same signature, no rename can be needed.
 */
export function renameSignature(doc: DocumentRecord): string {
  return [
    doc.extractedDate ?? '',
    doc.extractedVendor ?? '',
    doc.extractedAmount ?? '',
    doc.direction ?? '',
    doc.originalFilename ?? '',
  ].join('')
}
