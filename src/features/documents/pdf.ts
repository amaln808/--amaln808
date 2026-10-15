export interface RenderedDocument {
  blob: Blob
  /** PNG data URL of the first page, for on-screen preview */
  previewUrl: string
}

/** Captures an element to an A4 PDF. Libraries are loaded on demand. */
export async function renderPdf(el: HTMLElement): Promise<RenderedDocument> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  await document.fonts.ready
  await Promise.all(
    [...el.querySelectorAll('img')].map((img) =>
      img.complete ? null : new Promise((r) => img.addEventListener('load', r, { once: true })),
    ),
  )
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgH = (canvas.height * pageW) / canvas.width
  const jpeg = canvas.toDataURL('image/jpeg', 0.92)
  if (imgH <= pageH * 1.08) {
    // Slightly taller than A4: shrink to fit one page rather than spill a sliver onto page 2
    const h = Math.min(imgH, pageH)
    const w = (pageW * h) / imgH
    pdf.addImage(jpeg, 'JPEG', (pageW - w) / 2, 0, w, h)
  } else {
    for (let y = 0, page = 0; y < imgH - 1; y += pageH, page++) {
      if (page) pdf.addPage()
      pdf.addImage(jpeg, 'JPEG', 0, -y, pageW, imgH)
    }
  }
  return { blob: pdf.output('blob'), previewUrl: canvas.toDataURL('image/png') }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
