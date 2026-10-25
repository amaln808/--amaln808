import { Download, Loader2, Mail, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LOGO_URL } from '../../app/assets'
import { Segmented } from '../../components/form'
import { Button, Card } from '../../components/ui'
import { signedUrl } from '../../data/files'
import { type Settings, updateSettings } from '../../data/settings'
import { type DocLang, t } from '../../i18n/index'
import { downloadBlob, renderPdf, type RenderedDocument } from './pdf'
import { type DocCompany, type DocData, type DocImages, SalesDocument } from './SalesDocument'
import { sealAllowed } from './seal'
import { shareOrDownload, sharePdf } from './share'

/** Private images become data URLs so the PDF capture never trips over cross-origin rules. */
async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

async function loadImages(settings: Settings, withSeal: boolean): Promise<DocImages> {
  const get = async (path: string | null) => (path ? toDataUrl(await signedUrl('branding', path)).catch(() => null) : null)
  const [logo, stamp, signature] = await Promise.all([
    settings.logoPath ? get(settings.logoPath) : Promise.resolve(LOGO_URL),
    // The stamp and signature are fetched only for an issued invoice
    withSeal ? get(settings.stampPath) : Promise.resolve(null),
    withSeal ? get(settings.signaturePath) : Promise.resolve(null),
  ])
  return { logo: logo ?? LOGO_URL, stamp, signature }
}

/**
 * Renders the document off-screen, turns it into a PDF in the background, and
 * shows a preview with share / download buttons. Pre-generating keeps the
 * share tap instant, which iOS requires for the share sheet.
 */
export function DocumentPanel({
  doc,
  settings,
  shareText,
  email,
}: {
  doc: DocData
  settings: Settings
  /** Message sent with the PDF, in the chosen document language */
  shareText: (lang: DocLang) => string
  email?: string | null
}) {
  const [docLang, setDocLang] = useState<DocLang>(settings.docLanguage ?? 'ar')
  const chooseLang = (l: DocLang) => {
    setDocLang(l)
    updateSettings({ docLanguage: l }).catch(() => {}) // remember as the default
  }
  const withSeal = sealAllowed(doc)
  const [images, setImages] = useState<DocImages | null>(null)
  useEffect(() => {
    let cancelled = false
    loadImages(settings, withSeal).then((i) => !cancelled && setImages(i))
    return () => {
      cancelled = true
    }
  }, [settings.logoPath, settings.stampPath, settings.signaturePath, withSeal])

  const company: DocCompany = {
    name: settings.companyName,
    nameEn: settings.companyNameEn,
    phone: settings.phone,
    crNo: settings.crNo,
    vatNo: settings.vatNo,
    address: settings.address,
    addressEn: settings.addressEn,
    vatRegistered: settings.vatRegistered,
  }
  const ref = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState<RenderedDocument | null>(null)
  const [failed, setFailed] = useState(false)
  const filename = `${doc.number}${docLang === 'en' ? '-EN' : docLang === 'both' ? '-AR-EN' : ''}.pdf`
  const key = JSON.stringify({ doc, docLang, company, ready: !!images, seal: images?.stamp?.length, sig: images?.signature?.length, logo: images?.logo.length })

  useEffect(() => {
    if (!images) return
    let cancelled = false
    setRendered(null)
    setFailed(false)
    const timer = setTimeout(() => {
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
      clearTimeout(timer)
    }
  }, [key])

  const share = async () => {
    if (rendered) await sharePdf(rendered.blob, filename, { text: shareText(docLang), phone: doc.customer?.phone ?? undefined })
  }
  const sendEmail = async () => {
    if (!rendered) return
    const result = await shareOrDownload(rendered.blob, filename, 'application/pdf')
    if (result === 'fallback') {
      // No share sheet here: the PDF was downloaded; open a pre-filled email to attach it to
      window.location.href = `mailto:${email ?? ''}?subject=${encodeURIComponent(doc.number)}&body=${encodeURIComponent(shareText(docLang))}`
    }
  }

  return (
    <Card>
      <div className="mb-4 max-w-md">
        <div className="mb-1.5 text-sm font-medium text-stone-700">{t('لغة المستند', 'Document language')}</div>
        <Segmented
          value={docLang}
          onChange={chooseLang}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
            { value: 'both', label: 'عربي + English' },
          ]}
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={share} disabled={!rendered} className="!bg-[#25D366] !text-white hover:!bg-[#1ebe5a]">
          {rendered ? <Share2 className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
          {t('مشاركة PDF عبر واتساب', 'Share PDF via WhatsApp')}
        </Button>
        <Button variant="secondary" onClick={sendEmail} disabled={!rendered}>
          <Mail className="size-5" /> {t('إرسال بالبريد', 'Send by email')}
        </Button>
        <Button variant="secondary" onClick={() => rendered && downloadBlob(rendered.blob, filename)} disabled={!rendered}>
          <Download className="size-5" /> {t('تنزيل PDF', 'Download PDF')}
        </Button>
      </div>
      {withSeal && images && (!images.stamp || !images.signature) && (
        <p className="mb-3 text-sm text-muted">{t('لم يُرفع الختم أو التوقيع بعد — يُضافان من الإعدادات ← الشعار والختم والتوقيع.', 'No stamp or signature uploaded yet — add them in Settings → Logo, stamp and signature.')}</p>
      )}
      {failed && <p className="mb-3 text-sm text-red-700">{t('تعذر إنشاء ملف PDF.', "Couldn't create the PDF.")}</p>}
      <div className="overflow-hidden rounded-xl border border-line bg-stone-100">
        {rendered ? (
          <img src={rendered.previewUrl} alt={t('معاينة المستند', 'Document preview')} className="mx-auto w-full max-w-[794px] bg-white" />
        ) : (
          <div className="flex aspect-[1/1.414] items-center justify-center text-stone-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        )}
      </div>
      {/* Off-screen source for the PDF */}
      {images && (
        <div aria-hidden style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }}>
          <SalesDocument ref={ref} doc={doc} company={company} images={images} lang={docLang} />
        </div>
      )}
    </Card>
  )
}
