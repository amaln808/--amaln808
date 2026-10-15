import { type DocLang, t } from '../../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileCheck2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSettings } from '../../app/useSettings'
import { errorMessage, formatDate } from '../../components/format'
import { useConfirm } from '../../components/useConfirm'
import { Button, LinkButton, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import { formatOMR } from '../../domain/money'
import { quoteDisplayStatus } from '../../domain/sales'
import { ar } from '../../i18n/ar'
import { deleteQuote, setQuoteStatus } from '../../services/sales'
import { DocumentPanel } from '../documents/DocumentPanel'
import { QuoteStatusBadge } from './StatusBadges'

export function QuoteDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const quote = useLiveQuery(() => db.quotations.get(id), [id])
  const customer = useLiveQuery(async () => (quote ? db.customers.get(quote.customerId) : undefined), [quote?.customerId])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const invoice = useLiveQuery(async () => (quote?.invoiceId ? db.salesInvoices.get(quote.invoiceId) : undefined), [quote?.invoiceId])
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (quote === undefined || !settings || !items) return null
  if (quote === null) return <p>{t("عرض السعر غير موجود", "Quotation not found")}</p>

  const status = quoteDisplayStatus(quote, today())
  const open = !quote.invoiceId && quote.status !== 'rejected'

  const remove = async () => {
    if (!(await confirm({ title: t(`حذف ${quote.quoteNo}`, `Delete ${quote.quoteNo}`), message: t("حذف عرض السعر؟", "Delete this quotation?"), confirmLabel: t("حذف", "Delete"), danger: true }))) return
    await deleteQuote(db, quote.id)
    navigate(`/customers/${quote.customerId}`, { replace: true })
  }
  const mark = (s: 'sent' | 'rejected') => setQuoteStatus(db, quote.id, s).catch((e) => setError(errorMessage(e)))

  const shareText = (lang: DocLang) => {
    const arText = `مرحباً ${customer?.name ?? ''}، مرفق عرض سعر رقم ${quote.quoteNo} بإجمالي ${formatOMR(quote.totalBaisa, 'ar')}${quote.validUntil ? `، ساري حتى ${formatDate(quote.validUntil)}` : ''}. مع تحيات ${settings.businessName}.`
    const enText = `Hello ${customer?.name ?? ''}, please find attached quotation ${quote.quoteNo} totalling ${formatOMR(quote.totalBaisa, 'en')}${quote.validUntil ? `, valid until ${formatDate(quote.validUntil)}` : ''}. Best regards, ${settings.businessName}.`
    return lang === 'en' ? enText : lang === 'both' ? `${arText}\n\n${enText}` : arText
  }

  return (
    <>
      <PageHeader
        title={t(`عرض سعر ${quote.quoteNo}`, `Quotation ${quote.quoteNo}`)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link to={`/customers/${quote.customerId}`} className="text-brand-700">{customer?.name}</Link>·
            <span className="num">{formatDate(quote.date)}</span>
            <QuoteStatusBadge status={status} />
            {invoice && <Link to={`/invoices/${invoice.id}`} className="text-sm text-brand-700">{t("← الفاتورة", "→ Invoice")} {invoice.invoiceNo}</Link>}
          </span>
        }
        back={{ to: `/customers/${quote.customerId}`, label: customer?.name ?? ar.nav.customers }}
        actions={
          open && (
            <>
              <LinkButton to={`/invoices/new?quote=${quote.id}`}>
                <FileCheck2 className="size-5" /> {t("تحويل إلى فاتورة", "Convert to invoice")}
              </LinkButton>
              <Button variant="secondary" onClick={() => mark('rejected')}>
                <X className="size-5" /> {t("رفض العميل", "Customer declined")}
              </Button>
            </>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={t("إجمالي العرض", "Quotation total")} value={formatOMR(quote.totalBaisa)} />
        <Stat label={t("ساري حتى", "Valid until")} value={quote.validUntil ? formatDate(quote.validUntil) : '—'} tone={status === 'expired' ? 'red' : undefined} />
      </div>

      <DocumentPanel
        doc={{
          kind: 'quote',
          number: quote.quoteNo,
          date: quote.date,
          untilDate: quote.validUntil,
          customer: customer ?? undefined,
          lines: quote.lines,
          subtotalBaisa: quote.subtotalBaisa,
          discountBaisa: quote.discountBaisa,
          vatRatePercent: quote.vatRatePercent,
          vatBaisa: quote.vatBaisa,
          totalBaisa: quote.totalBaisa,
          notes: quote.notes,
        }}
        settings={settings}
        items={new Map(items.map((i) => [i.id, i]))}
        shareText={shareText}
        onShared={() => quote.status === 'draft' && mark('sent')}
      />

      <div className="mt-6">
        <Button variant="ghost" className="text-red-700" onClick={remove}>
          <Trash2 className="size-4" /> {t("حذف عرض السعر", "Delete quotation")}
        </Button>
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {dialog}
    </>
  )
}
