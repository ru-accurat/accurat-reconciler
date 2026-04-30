'use client'

import { useEffect, useState } from 'react'
import { File } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { renderPdfThumbnail } from '@/lib/pdf-thumbnail'
import { useDocumentStore } from '@/stores/documentStore'
import { DocumentRecord } from '@/lib/types'

const PDF_RE = /\.pdf$/i
const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i

const inFlight = new Map<string, Promise<string | null>>()
const failed = new Set<string>()

// Cap concurrent generation. Without this, 92 cards mounting at once
// hammered the user's CPU and the auto-save debounce kept resetting,
// leaving most thumbnailPath fields unpersisted.
const MAX_CONCURRENT = 3
let active = 0
const queue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => queue.push(resolve))
}

function releaseSlot(): void {
  active--
  const next = queue.shift()
  if (next) {
    active++
    next()
  }
}

function getPublicUrl(storagePath: string): string {
  return supabase.storage.from('documents').getPublicUrl(storagePath).data.publicUrl
}

async function ensurePdfThumbnail(
  doc: DocumentRecord,
  onResolved: (path: string) => void
): Promise<string | null> {
  if (failed.has(doc.id)) return null
  if (inFlight.has(doc.id)) return inFlight.get(doc.id)!

  const promise = (async () => {
    await acquireSlot()
    try {
      const { data: file, error: dlErr } = await supabase.storage
        .from('documents')
        .download(doc.storedPath)
      if (dlErr || !file) {
        console.error(`Thumbnail: failed to download PDF for ${doc.id}:`, dlErr)
        failed.add(doc.id)
        return null
      }

      let blob: Blob
      try {
        blob = await renderPdfThumbnail(file, { maxWidth: 480, quality: 0.82 })
      } catch (e) {
        console.error(`Thumbnail: render failed for ${doc.id}:`, e)
        failed.add(doc.id)
        return null
      }

      const thumbnailPath = `thumbnails/${doc.id}.webp`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(thumbnailPath, blob, { contentType: 'image/webp', upsert: true })
      if (upErr) {
        console.error(`Thumbnail: upload failed for ${doc.id}:`, upErr)
        failed.add(doc.id)
        return null
      }

      onResolved(thumbnailPath)
      // Bypass the AppShell auto-save debounce. With many cards generating
      // in a burst, each updateDocument() call resets the 2s timer, so the
      // final flush often never fires before the tab closes. Saving here
      // ensures every individual thumbnailPath gets persisted.
      void useDocumentStore.getState().save()
      return thumbnailPath
    } finally {
      releaseSlot()
    }
  })().finally(() => inFlight.delete(doc.id))

  inFlight.set(doc.id, promise)
  return promise
}

interface Props {
  document: DocumentRecord
  onThumbnailReady: (docId: string, thumbnailPath: string) => void
  className?: string
}

export default function DocumentThumbnail({ document: doc, onThumbnailReady, className }: Props) {
  const isPdf = PDF_RE.test(doc.originalFilename) || PDF_RE.test(doc.storedPath)
  const isImage = IMAGE_RE.test(doc.originalFilename) || IMAGE_RE.test(doc.storedPath)

  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    if (isImage) return getPublicUrl(doc.storedPath)
    if (doc.thumbnailPath) return getPublicUrl(doc.thumbnailPath)
    return null
  })

  useEffect(() => {
    if (thumbUrl) return
    if (!isPdf) return

    let cancelled = false
    ensurePdfThumbnail(doc, (path) => {
      if (cancelled) return
      onThumbnailReady(doc.id, path)
      setThumbUrl(getPublicUrl(path))
    })
    return () => {
      cancelled = true
    }
  }, [doc, isPdf, thumbUrl, onThumbnailReady])

  if (thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbUrl}
        alt={doc.originalFilename}
        className={className ?? 'w-full h-full object-contain'}
        loading="lazy"
      />
    )
  }

  return <File size={48} className="text-gray-300" />
}
