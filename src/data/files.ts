import { db } from './client'

export type Bucket = 'products' | 'lab-certificates' | 'receipts' | 'branding'

/** New size that fits inside max×max, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read the image'))
    }
    img.src = url
  })
}

/**
 * Shrinks a photo on the iPad before upload (camera photos are 3–5 MB; this gives
 * ~200–400 KB). PNG keeps transparency — needed for the stamp and signature.
 */
export async function compressImage(
  file: Blob,
  { maxDim = 1600, type = 'image/jpeg', quality = 0.75 }: { maxDim?: number; type?: 'image/jpeg' | 'image/png'; quality?: number } = {},
): Promise<Blob> {
  const img = await loadImage(file)
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxDim)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not compress the image'))), type, quality),
  )
}

export async function uploadFile(bucket: Bucket, path: string, blob: Blob): Promise<string> {
  const { error } = await db().storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type })
  if (error) throw error
  return path
}

export async function removeFile(bucket: Bucket, path: string) {
  const { error } = await db().storage.from(bucket).remove([path])
  if (error) throw error
}

const signed = new Map<string, { url: string; expires: number }>()

/** Temporary link (1 hour) to a private file; reused while still valid. */
export async function signedUrl(bucket: Bucket, path: string): Promise<string> {
  const key = `${bucket}/${path}`
  const hit = signed.get(key)
  if (hit && hit.expires > Date.now() + 60_000) return hit.url
  const { data, error } = await db().storage.from(bucket).createSignedUrl(path, 3600)
  if (error) throw error
  signed.set(key, { url: data.signedUrl, expires: Date.now() + 3600_000 })
  return data.signedUrl
}
