import { Link2 } from 'lucide-react'
import { useState } from 'react'
import { cleanDocumentUrl, isValidDocumentUrl } from '../domain/documentUrl'
import { serverError } from '../data/errors'
import { t } from '../i18n/index'
import { Field, FormError, TextInput } from './form'
import { Button } from './ui'

/** Message for a link that does not start with https (null when fine or empty). */
export function documentUrlError(value: string | null | undefined): string | null {
  return isValidDocumentUrl(value) ? null : t('الرابط يجب أن يبدأ بـ https:// (مثل رابط Google Drive).', 'The link must start with https:// (like a Google Drive link).')
}

/** «رابط المستند» box for add / edit forms. The form checks documentUrlError before saving. */
export function DocumentUrlField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const error = value.trim() ? documentUrlError(value) : null
  return (
    <Field
      className={className}
      label={t('رابط المستند (اختياري)', 'Document link (optional)')}
      hint={error ? <span className="text-red-700">{error}</span> : t('يُلصق رابط ملف PDF من Google Drive. لا يُرفع أي ملف.', 'Paste the link to the PDF in Google Drive. No file is uploaded.')}
    >
      <TextInput
        type="url"
        inputMode="url"
        dir="ltr"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="https://drive.google.com/…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
    </Field>
  )
}

/** «📄 فتح المستند»: opens the link in a new tab; nothing when there is no (valid) link. */
export function OpenDocumentButton({ url, className = '' }: { url: string | null | undefined; className?: string }) {
  const href = cleanDocumentUrl(url)
  if (!href || !isValidDocumentUrl(href)) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-5 font-medium text-ink transition-colors hover:bg-stone-50 ${className}`}
    >
      <span aria-hidden>📄</span>
      {t('فتح المستند', 'Open document')}
    </a>
  )
}

/** 📎 next to a record in a list when it has a document link. */
export function DocIcon({ url }: { url: string | null | undefined }) {
  if (!cleanDocumentUrl(url)) return null
  return (
    <span role="img" aria-label={t('له مستند', 'Has a document')} title={t('له مستند', 'Has a document')} className="shrink-0 text-sm">
      📎
    </span>
  )
}

/**
 * For records that are not edited through a form (issued invoices, purchases):
 * the open button, plus a small editor to add, change or remove the link.
 */
export function DocumentLinkEditor({ url, onSave }: { url: string | null | undefined; onSave: (url: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const problem = documentUrlError(value)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await onSave(cleanDocumentUrl(value))
      setEditing(false)
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!editing)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <OpenDocumentButton url={url} />
        <Button
          variant="ghost"
          onClick={() => {
            setValue(url ?? '')
            setError(null)
            setEditing(true)
          }}
        >
          <Link2 className="size-5" />
          {cleanDocumentUrl(url) ? t('تعديل رابط المستند', 'Edit document link') : t('إضافة رابط المستند', 'Add document link')}
        </Button>
      </div>
    )

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <DocumentUrlField value={value} onChange={setValue} />
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الرابط', 'Save link')}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
          {t('إلغاء', 'Cancel')}
        </Button>
      </div>
    </div>
  )
}
