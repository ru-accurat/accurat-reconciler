'use client'

// pdfjs-dist relies on browser globals (DOMMatrix, window, etc.) at module load time,
// so we lazy-import it via a dynamic `import()` to keep the server-side bundle clean.
type PdfjsModule = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfjsModule> | null = null
let workerInitialized = false

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist')
  const pdfjs = await pdfjsPromise
  if (!workerInitialized) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    workerInitialized = true
  }
  return pdfjs
}

export interface ThumbnailOptions {
  // Target width in CSS pixels. Height is derived from page aspect ratio.
  maxWidth?: number
  // WebP quality 0..1.
  quality?: number
}

/**
 * Render the first page of a PDF to a WebP blob.
 * Runs entirely client-side via pdfjs in a web worker.
 */
export async function renderPdfThumbnail(
  source: Blob | ArrayBuffer,
  { maxWidth = 400, quality = 0.85 }: ThumbnailOptions = {}
): Promise<Blob> {
  const pdfjs = await loadPdfjs()

  const data = source instanceof Blob ? await source.arrayBuffer() : source
  const pdf = await pdfjs.getDocument({ data }).promise
  try {
    const page = await pdf.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(maxWidth / baseViewport.width, 2)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    await page.render({ canvas, viewport }).promise

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
        'image/webp',
        quality
      )
    })
  } finally {
    await pdf.destroy()
  }
}
