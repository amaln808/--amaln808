import { Download, Loader2, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Card } from '../../components/ui'
import type { Item, Settings } from '../../db/types'
import { downloadBlob, renderPdf, type RenderedDocument } from './pdf'
import { type DocData, SalesDocument } from './SalesDocument'
import { sharePdf } from './share'

/**
 * Renders the document off-screen, turns it into a PDF in the background, and
 * shows a preview with share / download buttons. Pre-generating keeps the
 * share tap instant, which iOS requires for the share sheet.
 */
export function DocumentPanel({
  doc,
  settings,
  items,
  shareText,
  onShared,
}: {
  doc: DocData
  settings: Settings
  items: Map<string, Item>
  shareText: string
  onShared?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState<RenderedDocument | null>(null)
  const [failed, setFailed] = useState(false)
  const filename = `${doc.number}.pdf`
  const key = JSON.stringify({ doc, s: [settings.businessName, settings.businessPhone, settings.commercialRegNo, settings.businessAddress, settings.logoDataUrl?.length] })

  useEffect(() => {
    let cancelled = false
    setRendered(null)
    setFailed(false)
    const t = setTimeout(() => {
      if (!ref.current) return
      renderPdf(ref.current)
        .then((r) => !cancelled && setRendered(r))
        .catch((e) => {
          console.error(e)
          if (!cancelled) setFailed(true)
        })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [key])

  const share = async () => {
    if (!rendered) return
    const result = await sharePdf(rendered.blob, filename, { text: shareText, phone: doc.customer?.phone })
    if (result !== 'cancelled') onShared?.()
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={share} disabled={!rendered} className="!bg-[#25D366] hover:!bg-[#1ebe5a]">
          {rendered ? <Share2 className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
          مشاركة PDF عبر واتساب
        </Button>
        <Button variant="secondary" onClick={() => rendered && downloadBlob(rendered.blob, filename)} disabled={!rendered}>
          <Download className="size-5" /> تنزيل PDF
        </Button>
      </div>
      {failed && <p className="mb-3 text-sm text-red-700">تعذر إنشاء ملف PDF.</p>}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
        {rendered ? (
          <img src={rendered.previewUrl} alt="معاينة المستند" className="mx-auto w-full max-w-[794px] bg-white" />
        ) : (
          <div className="flex aspect-[1/1.414] items-center justify-center text-stone-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        )}
      </div>
      {/* Off-screen source for the PDF */}
      <div aria-hidden style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }}>
        <SalesDocument ref={ref} doc={doc} settings={settings} items={items} />
      </div>
    </Card>
  )
}
