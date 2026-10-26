import { CheckCircle2, Pencil, Send, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { DateInput, Field, FormError, Select } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Badge, Button, Card, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { acceptQuotation, fetchQuotationDetail, fetchSales, SALES_KEY, setQuotationStatus } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { formatBaisa, formatOMR, lineTotal } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { optionTotals, type OptionKey } from '../../domain/quoteOptions'
import { nameOf, t } from '../../i18n/index'
import { DocumentPanel } from '../documents/DocumentPanel'
import { formatDate } from '../tasks/labels'
import { shareMessage, toDocData } from './docData'
import { optionLabel, optionLabels } from './priceOptions'
import { QUOTE_TONE, quoteStatusLabel, quoteStatusOf } from './summary'

export function QuotePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const q = useQuery(`quote:${id}`, () => fetchQuotationDetail(id))
  const sales = useQuery(SALES_KEY, fetchSales)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const settings = useSettingsQuery().data
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptDate, setAcceptDate] = useState(todayIso())
  const [choice, setChoice] = useState<OptionKey | ''>('')
  const [busy, setBusy] = useState(false)
  const today = todayIso()

  if (!q.data) {
    return (
      <>
        <PageHeader title={t('عرض أسعار', 'Quotation')} back={{ to: '/sales?tab=quotes', label: t('المبيعات', 'Sales') }} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }
  const { quotation: qt, lines } = q.data
  const products = new Map((items.data ?? []).map((i) => [i.id, i]))
  const customer = sales.data?.customers.find((c) => c.id === qt.customerId)
  const status = quoteStatusOf(qt, today)
  const open = qt.status === 'draft' || qt.status === 'sent'
  const priced = (qt.priceOptions ?? []).map((o) => ({ o, ...optionTotals(lines, qt.discountBaisa, o.pct) }))
  const chosen = qt.priceOptions?.find((o) => o.key === (choice || qt.chosenOption))

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }
  const accept = () => {
    if (priced.length && !choice) return setError(t('يُرجى اختيار طريقة الدفع التي وافق عليها العميل.', 'Choose the payment option the customer agreed to.'))
    return run(async () => {
      const invoiceId = await acceptQuotation(qt.id, acceptDate, chosen ? { key: chosen.key, note: optionLabels(chosen).ar } : undefined)
      navigate(`/invoices/${invoiceId}`)
    })
  }

  return (
    <>
      <PageHeader
        title={t(`عرض أسعار ${qt.quoteNo}`, `Quotation ${qt.quoteNo}`)}
        subtitle={
          <>
            {customer ? <Link to={`/customers/${customer.id}`} className="underline">{customer.name}</Link> : '—'} · {formatDate(qt.date)}
          </>
        }
        back={{ to: '/sales?tab=quotes', label: t('المبيعات', 'Sales') }}
        actions={
          open && (
            <Link to={`/quotes/${qt.id}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4">
              <Pencil className="size-4" />
              {t('تعديل', 'Edit')}
            </Link>
          )
        }
      />
      <div className="flex flex-col gap-5">
        <Card className="flex flex-wrap items-center gap-3">
          <Badge tone={QUOTE_TONE[status]}>{quoteStatusLabel(status)}</Badge>
          {qt.validUntil && open && <span className="text-sm text-muted">{t(`ساري حتى ${formatDate(qt.validUntil)}`, `Valid until ${formatDate(qt.validUntil)}`)}</span>}
          {qt.invoiceId && (
            <Link to={`/invoices/${qt.invoiceId}`} className="font-medium text-brand-800 underline">
              {t('فتح الفاتورة', 'Open the invoice')}
            </Link>
          )}
          {open && (
            <div className="ms-auto flex flex-wrap gap-2">
              {qt.status === 'draft' && (
                <Button variant="secondary" disabled={busy} onClick={() => run(() => setQuotationStatus(qt.id, 'sent'))}>
                  <Send className="size-4" />
                  {t('تم الإرسال', 'Mark sent')}
                </Button>
              )}
              <Button variant="secondary" disabled={busy} className="text-red-700" onClick={() => run(() => setQuotationStatus(qt.id, 'rejected'))}>
                <XCircle className="size-4" />
                {t('مرفوض', 'Rejected')}
              </Button>
              <Button disabled={busy} onClick={() => setAccepting(true)}>
                <CheckCircle2 className="size-5" />
                {t('تم القبول', 'Accepted')}
              </Button>
            </div>
          )}
          {qt.status === 'rejected' && (
            <Button variant="ghost" className="ms-auto" disabled={busy} onClick={() => run(() => setQuotationStatus(qt.id, 'sent'))}>
              {t('إعادة فتح العرض', 'Reopen')}
            </Button>
          )}
        </Card>
        <FormError message={error} />

        <Card className="p-0">
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="min-w-0 flex-1 font-medium">{nameOf(products.get(l.productId))}</span>
                <span className="num text-muted">
                  {formatQty(l.qty)} × {formatBaisa(l.unitPriceBaisa)}
                </span>
                <span className="num font-bold">{formatOMR(lineTotal(l.qty, l.unitPriceBaisa))}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-line px-5 py-3 text-lg font-bold">
            <span>{t('الإجمالي', 'Total')}</span>
            <span className="num">{formatOMR(qt.totalBaisa)}</span>
          </div>
        </Card>

        {priced.length > 0 && (
          <Card className="p-0">
            <h2 className="px-5 pt-4 text-lg font-bold">{t('خيارات الأسعار حسب طريقة الدفع', 'Prices by payment option')}</h2>
            <ul className="mt-2 divide-y divide-line">
              {priced.map(({ o, prices, totalBaisa }) => (
                <li key={o.key} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 ${qt.chosenOption === o.key ? 'bg-brand-50' : ''}`}>
                  <span className="min-w-0 flex-1 font-medium">
                    {optionLabel(o)}
                    {qt.chosenOption === o.key && <span className="ms-2"><Badge tone="green">{t('اختاره العميل', 'Chosen')}</Badge></span>}
                  </span>
                  <span className="num text-sm text-muted">{prices.map((p) => formatBaisa(p)).join(' · ')}</span>
                  <span className="num font-bold">{formatOMR(totalBaisa)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {settings && (
          <DocumentPanel
            doc={toDocData({
              kind: 'quote',
              status,
              number: qt.quoteNo,
              date: qt.date,
              untilDate: qt.validUntil,
              customer,
              lines,
              products,
              totals: qt,
              notes: qt.notes,
              options: priced.map(({ o, prices, totalBaisa }) => ({ ...optionLabels(o), prices, totalBaisa })),
            })}
            settings={settings}
            email={customer?.email}
            shareText={(lang) => shareMessage('quote', qt.quoteNo, formatOMR(qt.totalBaisa, lang === 'en' ? 'en' : 'ar'), lang === 'en' ? settings.companyNameEn || settings.companyName : settings.companyName, lang)}
          />
        )}
      </div>

      {accepting && (
        <Modal
          open
          onClose={() => setAccepting(false)}
          title={t('تحويل العرض إلى فاتورة', 'Turn the quotation into an invoice')}
          footer={
            <Button className="flex-1" disabled={busy} onClick={accept}>
              {busy ? t('جارٍ الإصدار…', 'Issuing…') : t('إصدار الفاتورة', 'Issue invoice')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <p>
              {priced.length > 0
                ? t(
                    'تصدر فاتورة برقم تسلسلي جديد بنفس البنود وبأسعار طريقة الدفع المختارة (وتاريخ استحقاقها)، ويُخصم المنتج من الدفعات الأقرب انتهاءً أولاً، ويُضاف الختم والتوقيع.',
                    'A new numbered invoice is issued with the same lines at the chosen option’s prices (and due date); stock comes out of the lots nearest expiry first; the stamp and signature are added.',
                  )
                : t(
                'تصدر فاتورة برقم تسلسلي جديد بنفس البنود والأسعار، ويُخصم المنتج من الدفعات الأقرب انتهاءً أولاً، ويُضاف الختم والتوقيع.',
                'A new numbered invoice is issued with the same lines and prices; stock comes out of the lots nearest expiry first; the stamp and signature are added.',
                  )}
            </p>
            {priced.length > 0 && (
              <Field label={t('طريقة الدفع التي وافق عليها العميل', 'Payment option the customer agreed to')} hint={chosen ? t(`إجمالي الفاتورة ${formatOMR(priced.find((x) => x.o.key === chosen.key)!.totalBaisa)}`, `Invoice total ${formatOMR(priced.find((x) => x.o.key === chosen.key)!.totalBaisa)}`) : undefined}>
                <Select value={choice} onChange={(e) => setChoice(e.target.value as OptionKey | '')}>
                  <option value="">{t('اختيار…', 'Choose…')}</option>
                  {priced.map(({ o }) => (
                    <option key={o.key} value={o.key}>
                      {optionLabel(o)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t('تاريخ الفاتورة', 'Invoice date')}>
              <DateInput value={acceptDate} onChange={(e) => setAcceptDate(e.target.value)} />
            </Field>
            <FormError message={error} />
          </div>
        </Modal>
      )}
    </>
  )
}
