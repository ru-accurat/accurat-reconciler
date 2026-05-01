import { supabase } from '@/lib/supabase'
import type { DocumentRecord } from '@/lib/types'
import { buildSemanticPath, buildSemanticThumbnailPath, type SemanticContext } from '@/lib/storage-naming'

/**
 * If `doc.storedPath` no longer matches its semantic path (a tag field
 * changed — direction / vendor / date / matched-txn category), copy the
 * storage object to the new path and return the patch to apply to the
 * doc record.
 *
 * Implementation detail: copy+remove instead of `move()`.  This bucket's
 * RLS policy grants the anon key INSERT and DELETE rights, but not the
 * dedicated `move` storage action — `move()` returns 404 even though
 * the source file exists.  copy+remove decomposes the operation into
 * two policy checks the anon role does pass.
 */
export async function renameDocumentStorageIfNeeded(
  doc: DocumentRecord,
  ctx: SemanticContext = {}
): Promise<Partial<DocumentRecord> | null> {
  const desired = buildSemanticPath(doc, ctx)
  if (desired === doc.storedPath) return null

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
    console.warn(`Storage rename: copy succeeded but old object lingered: ${doc.storedPath}`, removeErr)
  }

  const patch: Partial<DocumentRecord> = {
    storedPath: desired,
    historicalPaths: [...(doc.historicalPaths ?? []), doc.storedPath],
  }

  // Thumbnails live at `thumbnails/<docId>.webp` (docId-based, stable).
  // They never need renaming when the source PDF is renamed, so we just
  // ensure the patch carries the canonical path forward.
  patch.thumbnailPath = buildSemanticThumbnailPath(doc, ctx)

  // Persist path columns to DB directly — auto-save deliberately skips
  // these (the rename subsystem owns them) so the patch needs to write
  // them itself.  In-memory state is updated by the caller via the patch
  // return value.
  const { error: dbErr } = await supabase
    .from('documents')
    .update({
      stored_path: patch.storedPath,
      thumbnail_path: patch.thumbnailPath ?? null,
      historical_paths: patch.historicalPaths ?? [],
    })
    .eq('id', doc.id)
  if (dbErr) {
    console.error(`Storage rename: DB row update failed for ${doc.id}:`, dbErr)
  }

  return patch
}

/**
 * Compact signature of a doc's rename-trigger fields, including the
 * resolved category.  If two snapshots have the same signature, no
 * rename can be needed.
 */
export function renameSignature(doc: DocumentRecord, ctx: SemanticContext = {}): string {
  return [
    doc.extractedDate ?? '',
    doc.extractedVendor ?? '',
    doc.direction ?? '',
    doc.originalFilename ?? '',
    ctx.category ?? '',
    ctx.contactName ?? '',
  ].join('|')
}
