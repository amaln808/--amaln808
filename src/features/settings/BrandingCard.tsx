import { ImageUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LOGO_URL } from '../../app/assets'
import { FormError } from '../../components/form'
import { Button, Card } from '../../components/ui'
import { serverError } from '../../data/errors'
import { compressImage, removeFile, signedUrl, uploadFile } from '../../data/files'
import { type Settings, updateSettings } from '../../data/settings'
import { invalidate } from '../../data/useQuery'
import { t } from '../../i18n/index'
import { SectionTitle } from './SectionTitle'

type Slot = 'logo' | 'stamp' | 'signature'
const FIELD = { logo: 'logoPath', stamp: 'stampPath', signature: 'signaturePath' } as const

/** Private image from the branding bucket, through a temporary signed link. */
function useBrandingUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setUrl(null)
    if (path) signedUrl('branding', path).then((u) => !cancelled && setUrl(u)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [path])
  return url
}

function Tile({ slot, settings, title, note }: { slot: Slot; settings: Settings; title: string; note: string }) {
  const path = settings[FIELD[slot]]
  const url = useBrandingUrl(path)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      // PNG keeps the transparent background the stamp and signature need
      const blob = await compressImage(file, { maxDim: 900, type: 'image/png' })
      const newPath = `${slot}-${Date.now()}.png`
      await uploadFile('branding', newPath, blob)
      await updateSettings({ [FIELD[slot]]: newPath })
      if (path) removeFile('branding', path).catch(() => {})
      invalidate('usage')
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const preview = url ?? (slot === 'logo' && !path ? LOGO_URL : null)
  return (
    <div className="flex flex-col gap-3">
      {/* Chequered backdrop shows whether the PNG is really transparent */}
      <div
        className="flex h-36 items-center justify-center rounded-xl border border-line p-3"
        style={{
          backgroundImage:
            'linear-gradient(45deg, var(--line) 25%, transparent 25%), linear-gradient(-45deg, var(--line) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--line) 75%), linear-gradient(-45deg, transparent 75%, var(--line) 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
        }}
      >
        {preview ? (
          <img src={preview} alt={title} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-sm text-muted">{path ? t('جارٍ التحميل…', 'Loading…') : t('لم تُرفع بعد', 'Not uploaded')}</span>
        )}
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <p className="text-xs leading-relaxed text-muted">{note}</p>
      </div>
      <input ref={input} type="file" accept="image/png,image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
        <ImageUp className="size-5" />
        {busy ? t('جارٍ الرفع…', 'Uploading…') : path ? t('تغيير', 'Change') : t('رفع', 'Upload')}
      </Button>
      <FormError message={error} />
    </div>
  )
}

export function BrandingCard({ settings }: { settings: Settings }) {
  return (
    <Card>
      <SectionTitle
        note={t(
          'تُحفظ في مجلد خاص لا يصل إليه أحد غيرك. الختم والتوقيع يظهران فقط على الفواتير الصادرة، ولا يظهران على عروض الأسعار أو المسودات.',
          'Kept in a private folder only you can reach. The stamp and signature appear only on issued invoices — never on quotations or drafts.',
        )}
      >
        {t('الشعار والختم والتوقيع', 'Logo, stamp and signature')}
      </SectionTitle>
      <div className="grid gap-6 sm:grid-cols-3">
        <Tile slot="logo" settings={settings} title={t('الشعار', 'Logo')} note={t('يظهر في رأس المستندات.', 'Shown at the top of documents.')} />
        <Tile slot="stamp" settings={settings} title={t('الختم', 'Stamp')} note={t('صورة PNG بخلفية شفافة.', 'PNG with a transparent background.')} />
        <Tile slot="signature" settings={settings} title={t('التوقيع', 'Signature')} note={t('صورة PNG بخلفية شفافة.', 'PNG with a transparent background.')} />
      </div>
    </Card>
  )
}
