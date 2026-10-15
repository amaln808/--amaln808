import { toWhatsAppNumber } from '../../domain/sales'
import { downloadBlob } from './pdf'

export type ShareResult = 'shared' | 'cancelled' | 'fallback'

/**
 * Shares a PDF. On iPad/iPhone this opens the system share sheet (choose
 * WhatsApp). Where sharing files isn't supported, the PDF is downloaded and a
 * WhatsApp chat with the customer opens with the message pre-filled.
 * Must be called directly from a tap, with the PDF already generated.
 */
export async function sharePdf(
  blob: Blob,
  filename: string,
  opts: { text: string; phone?: string },
): Promise<ShareResult> {
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: opts.text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // NotAllowedError etc. → fall through to the WhatsApp link
    }
  }
  downloadBlob(blob, filename)
  const number = toWhatsAppNumber(opts.phone)
  window.open(`https://wa.me/${number ?? ''}?text=${encodeURIComponent(opts.text)}`, '_blank')
  return 'fallback'
}

/**
 * Shares any file through the system share sheet (on iPad: "Save to Files",
 * AirDrop, WhatsApp…), falling back to a plain download.
 */
export async function shareOrDownload(blob: Blob, filename: string, mime: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: mime })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(blob, filename)
  return 'fallback'
}
