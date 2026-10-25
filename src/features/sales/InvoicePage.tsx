import { Ban, HandCoins } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { Field, FormError, Textarea } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { fetchInvoiceDetail, fetchSales, SALES_KEY, voidInvoice } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { formatBaisa, formatOMR, lineTotal } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { DocumentPanel } from '../documents/DocumentPanel'
import { methodLabel } from '../inventory/labels'
import { formatDate } from '../tasks/labels'
import { CustomerPaymentModal } from './CustomerPaymentModal'
import { shareMessage, toDocData } from './docData'
import { INVOICE_TONE, invoiceStatusLabel, summarize } from './summary'

export function InvoicePage() {
  const { id = '' } = useParams()
  const q = useQuery(`invoice:${id}`, () => fetchInvoiceDetail(id))
  const sales = useQuery(SALES_KEY, fetchSales)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const settings = useSettingsQuery().data
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayIso()

  if (!q.data) {
    return (
      <>
        <PageHeader title={t('فاتورة', 'Invoice')} back={{ to: '/sales', label: t('المبيعات', 'Sales') }} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }
  const { invoice: inv, lines } = q.data
  const products = new Map((items.data ?? []).map((i) => [i.id, i]))
  const customer = sales.data?.customers.find((c) => c.id === inv.customerId)
  const sum = sales.data ? summarize(sales.data, today) : null
  const info = sum?.invoiceInfo.get(inv.id) ?? { paidBaisa: 0, status: inv.status === 'void' ? 'void' : 'unpaid' }
  const linkedPayments = (sales.data?.payments ?? []).filter((p) => p.invoiceId === inv.id)
  const quote = sales.data?.quotations.find((x) => x.id === inv.quotationId)

  const doVoid = async () => {
    setBusy(true)
    setError(null)
    try {
      await voidInvoice(inv.id, reason.trim() || null)
      setVoiding(false)
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title={t(`فاتورة ${inv.invoiceNo}`, `Invoice ${inv.invoiceNo}`)}
        subtitle={
          <>
            {customer ? <Link to={`/customers/${customer.id}`} className="underline">{customer.name}</Link> : '—'} · {formatDate(inv.date)}
            {quote && (
              <>
                {' · '}
                <Link to={`/quotes/${quote.id}`} className="underline">{t(`من العرض ${quote.quoteNo}`, `from ${quote.quoteNo}`)}</Link>
              </>
            )}
          </>
        }
        back={{ to: '/sales', label: t('المبيعات', 'Sales') }}
        actions={
          inv.status === 'issued' && (
            <>
              {info.status !== 'paid' && (
                <Button onClick={() => setPaying(true)}>
                  <HandCoins className="size-5" />
                  {t('تسجيل دفعة', 'Record payment')}
                </Button>
              )}
              <Button variant="ghost" className="text-red-700" onClick={() => setVoiding(true)}>
                <Ban className="size-4" />
                {t('إلغاء الفاتورة', 'Void')}
              </Button>
            </>
          )
        }
      />
      <div className="flex flex-col gap-5">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('الإجمالي', 'Total')} value={formatOMR(inv.totalBaisa)} />
          <Stat label={t('المدفوع', 'Paid')} value={formatOMR(info.paidBaisa)} tone={info.paidBaisa > 0 ? 'green' : undefined} />
          <Stat label={t('المتبقي', 'Left to pay')} value={formatOMR(inv.status === 'void' ? 0 : inv.totalBaisa - info.paidBaisa)} tone={info.status === 'overdue' ? 'red' : undefined} />
          <Stat label={t('تاريخ الاستحقاق', 'Due date')} value={inv.dueDate ? formatDate(inv.dueDate) : '—'} />
        </div>
        <Card className="flex flex-wrap items-center gap-3">
          <Badge tone={INVOICE_TONE[info.status]}>{invoiceStatusLabel(info.status)}</Badge>
          {inv.status === 'void' && (
            <span className="text-sm text-muted">
              {t('أُلغيت', 'Voided')} {inv.voidedAt ? formatDate(inv.voidedAt.slice(0, 10)) : ''}
              {inv.voidReason ? ` — ${inv.voidReason}` : ''} · {t('أُعيدت الكميات إلى دفعاتها', 'quantities returned to their lots')}
            </span>
          )}
        </Card>

        <Card className="p-0">
          <h2 className="px-5 pt-4 text-lg font-bold">{t('البنود ودفعاتها', 'Lines and their batches')}</h2>
          <ul className="mt-2 divide-y divide-line">
            {lines.map((l) => (
              <li key={l.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 font-medium">{nameOf(products.get(l.productId))}</span>
                  <span className="num text-muted">
                    {formatQty(l.qty)} × {formatBaisa(l.unitPriceBaisa)}
                  </span>
                  <span className="num font-bold">{formatOMR(lineTotal(l.qty, l.unitPriceBaisa))}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted">
                  {l.lots.map((x) => (
                    <span key={x.lotId} className="rounded-lg bg-brand-50 px-2 py-0.5">
                      {t('دفعة', 'Batch')} <span dir="ltr">{x.lotCode ?? '—'}</span>
                      {x.expiryDate ? ` · ${t('تنتهي', 'exp.')} ${formatDate(x.expiryDate)}` : ''} · {formatQty(x.qty)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-1 border-t border-line px-5 py-3">
            {inv.discountBaisa > 0 && (
              <div className="flex justify-between text-muted">
                <dt>{t('الخصم', 'Discount')}</dt>
                <dd className="num">− {formatOMR(inv.discountBaisa)}</dd>
              </div>
            )}
            {settings?.vatRegistered && (
              <div className="flex justify-between text-muted">
                <dt>{t('الضريبة', 'VAT')}</dt>
                <dd className="num">{formatOMR(inv.vatBaisa)}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <dt>{t('الإجمالي', 'Total')}</dt>
              <dd className="num">{formatOMR(inv.totalBaisa)}</dd>
            </div>
          </dl>
        </Card>

        {linkedPayments.length > 0 && (
          <Card className="p-0">
            <h2 className="px-5 pt-4 text-lg font-bold">{t('الدفعات المسجلة لهذه الفاتورة', 'Payments recorded for this invoice')}</h2>
            <ul className="mt-2 divide-y divide-line">
              {linkedPayments.map((p) => (
                <li key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="flex-1">
                    {formatDate(p.date)} · {methodLabel(p.method)}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </span>
                  <span className="num font-bold text-palm">{formatOMR(p.amountBaisa)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {settings && (
          <DocumentPanel
            doc={toDocData({
              kind: 'invoice',
              status: inv.status,
              number: inv.invoiceNo,
              date: inv.date,
              untilDate: inv.dueDate,
              customer,
              lines,
              products,
              totals: inv,
              paidBaisa: info.paidBaisa,
              notes: inv.notes,
            })}
            settings={settings}
            email={customer?.email}
            shareText={(lang) => shareMessage('invoice', inv.invoiceNo, formatOMR(inv.totalBaisa, lang === 'en' ? 'en' : 'ar'), lang === 'en' ? settings.companyNameEn || settings.companyName : settings.companyName, lang)}
          />
        )}
      </div>

      {paying && sales.data && sum && (
        <CustomerPaymentModal
          customerId={inv.customerId}
          invoices={sales.data.invoices.filter((i) => i.customerId === inv.customerId && i.status === 'issued')}
          invoiceInfo={sum.invoiceInfo}
          invoiceId={inv.id}
          balanceBaisa={sum.balances.get(inv.customerId)?.dueBaisa ?? 0}
          onClose={() => setPaying(false)}
        />
      )}
      {voiding && (
        <Modal
          open
          onClose={() => setVoiding(false)}
          title={t(`إلغاء الفاتورة ${inv.invoiceNo}`, `Void invoice ${inv.invoiceNo}`)}
          footer={
            <Button className="flex-1 !bg-red-700 !text-white" disabled={busy} onClick={doVoid}>
              {busy ? t('جارٍ الإلغاء…', 'Voiding…') : t('إلغاء الفاتورة', 'Void invoice')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <p>
              {t(
                'الفاتورة الصادرة لا تُعدَّل. الإلغاء يعيد الكميات إلى دفعاتها الأصلية، ويبقى الرقم ظاهراً «ملغاة». أي دفعة مسجلة لها تبقى رصيداً للعميل. للتصحيح: إلغاء ثم إصدار فاتورة جديدة.',
                'An issued invoice is never edited. Voiding returns the quantities to their lots and keeps the number, marked «void». Any payment on it stays as customer credit. To correct: void, then issue a new invoice.',
              )}
            </p>
            <Field label={t('سبب الإلغاء', 'Reason')}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <FormError message={error} />
          </div>
        </Modal>
      )}
    </>
  )
}
