import { FileText, HandCoins, Pencil, Phone, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { deleteCustomerPayment, fetchCustomerLots, fetchSales, SALES_KEY } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { formatOMR } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { toWhatsAppNumber } from '../../domain/sales'
import { nameOf, t } from '../../i18n/index'
import { methodLabel } from '../inventory/labels'
import { formatDate } from '../tasks/labels'
import { CustomerFormModal } from './CustomerFormModal'
import { CustomerPaymentModal } from './CustomerPaymentModal'
import { INVOICE_TONE, invoiceStatusLabel, QUOTE_TONE, quoteStatusLabel, quoteStatusOf, summarize } from './summary'

export function CustomerPage() {
  const { id = '' } = useParams()
  const sales = useQuery(SALES_KEY, fetchSales)
  const lots = useQuery(`customer:${id}:lots`, () => fetchCustomerLots(id))
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const today = todayIso()

  const data = sales.data
  const customer = data?.customers.find((c) => c.id === id)
  if (!data || !customer) {
    return (
      <>
        <PageHeader title={t('عميل', 'Customer')} back={{ to: '/sales?tab=customers', label: t('العملاء', 'Customers') }} />
        {sales.error ? <FormError message={serverError(sales.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }
  const { invoiceInfo, balances } = summarize(data, today)
  const b = balances.get(id) ?? { invoicedBaisa: 0, paidBaisa: 0, dueBaisa: 0, overdueBaisa: 0 }
  const invoices = data.invoices.filter((i) => i.customerId === id)
  const quotes = data.quotations.filter((x) => x.customerId === id)
  const payments = data.payments.filter((p) => p.customerId === id)
  const channel = data.channels.find((c) => c.id === customer.channelId)
  const products = new Map((items.data ?? []).map((i) => [i.id, i]))
  const wa = toWhatsAppNumber(customer.phone ?? undefined)

  const removePayment = async (pid: string) => {
    const ok = await confirm({
      title: t('حذف الدفعة', 'Delete payment'),
      message: t('تُحذف الدفعة ويعود المبلغ مستحقاً على العميل.', 'The payment is removed and the amount is owed again.'),
      confirmLabel: t('حذف', 'Delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteCustomerPayment(pid)
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={[channel?.name, customer.phone, customer.address].filter(Boolean).join(' · ') || undefined}
        back={{ to: '/sales?tab=customers', label: t('العملاء', 'Customers') }}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              {t('تعديل', 'Edit')}
            </Button>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4">
                <Phone className="size-4" />
                {t('واتساب', 'WhatsApp')}
              </a>
            )}
            <Button onClick={() => setPaying(true)}>
              <HandCoins className="size-5" />
              {t('تسجيل دفعة', 'Record payment')}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <FormError message={error} />
        {!customer.active && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('هذا العميل موقوف.', 'This customer is deactivated.')}</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('إجمالي الفواتير', 'Invoiced')} value={formatOMR(b.invoicedBaisa)} />
          <Stat label={t('المدفوع', 'Paid')} value={formatOMR(b.paidBaisa)} tone={b.paidBaisa > 0 ? 'green' : undefined} />
          <Stat label={b.dueBaisa < 0 ? t('رصيد للعميل', 'Customer credit') : t('المستحق', 'Owed')} value={formatOMR(Math.abs(b.dueBaisa))} />
          <Stat label={t('منه متأخر', 'Of which overdue')} value={formatOMR(b.overdueBaisa)} tone={b.overdueBaisa > 0 ? 'red' : undefined} />
        </div>
        {!channel && (
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm">
            {t('لا توجد قناة لهذا العميل، فلن تُعبأ الأسعار تلقائياً. أضيفوا القناة من «تعديل».', 'No channel for this customer, so prices are not filled in. Add one with «Edit».')}
          </p>
        )}

        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <h2 className="text-lg font-bold">{t('الفواتير', 'Invoices')}</h2>
            <Link to={`/invoices/new?customer=${id}`} className="text-sm font-medium text-brand-800 underline">
              {t('فاتورة جديدة', 'New invoice')}
            </Link>
          </div>
          {!invoices.length ? (
            <p className="px-5 pb-4 pt-2 text-sm text-muted">{t('لا توجد فواتير.', 'No invoices.')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {invoices.map((i) => {
                const info = invoiceInfo.get(i.id)
                return (
                  <li key={i.id}>
                    <Link to={`/invoices/${i.id}`} className={`flex items-center gap-3 px-5 py-3 hover:bg-brand-50 ${i.status === 'void' ? 'opacity-60' : ''}`}>
                      <span className="font-bold" dir="ltr">{i.invoiceNo}</span>
                      <span className="flex-1 text-sm text-muted">{formatDate(i.date)}</span>
                      {info && <Badge tone={INVOICE_TONE[info.status]}>{invoiceStatusLabel(info.status)}</Badge>}
                      <span className="num font-bold">{formatOMR(i.totalBaisa)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <h2 className="text-lg font-bold">{t('عروض الأسعار', 'Quotations')}</h2>
            <Link to={`/quotes/new?customer=${id}`} className="text-sm font-medium text-brand-800 underline">
              {t('عرض سعر جديد', 'New quotation')}
            </Link>
          </div>
          {!quotes.length ? (
            <p className="px-5 pb-4 pt-2 text-sm text-muted">{t('لا توجد عروض.', 'No quotations.')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {quotes.map((x) => {
                const s = quoteStatusOf(x, today)
                return (
                  <li key={x.id}>
                    <Link to={`/quotes/${x.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50">
                      <FileText className="size-4 text-muted" />
                      <span className="font-bold" dir="ltr">{x.quoteNo}</span>
                      <span className="flex-1 text-sm text-muted">{formatDate(x.date)}</span>
                      <Badge tone={QUOTE_TONE[s]}>{quoteStatusLabel(s)}</Badge>
                      <span className="num font-bold">{formatOMR(x.totalBaisa)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <h2 className="px-5 pt-4 text-lg font-bold">{t('الدفعات المستلمة', 'Payments received')}</h2>
          {!payments.length ? (
            <p className="px-5 pb-4 pt-2 text-sm text-muted">{t('لا توجد دفعات.', 'No payments.')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {payments.map((p) => {
                const inv = invoices.find((i) => i.id === p.invoiceId)
                return (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div>
                        {formatDate(p.date)} · {methodLabel(p.method)}
                      </div>
                      <div className="text-sm text-muted">
                        {inv ? t(`عن الفاتورة ${inv.invoiceNo}`, `for ${inv.invoiceNo}`) : t('تحت الحساب', 'on account')}
                        {p.notes ? ` · ${p.notes}` : ''}
                      </div>
                    </div>
                    <span className="num font-bold text-palm">{formatOMR(p.amountBaisa)}</span>
                    <button type="button" onClick={() => removePayment(p.id)} className="flex size-11 items-center justify-center rounded-xl text-muted hover:bg-red-50 hover:text-red-700" aria-label={t('حذف', 'Delete')}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <h2 className="px-5 pt-4 text-lg font-bold">{t('الدفعات التي استلمها (للتتبع)', 'Batches received (traceability)')}</h2>
          <p className="px-5 text-sm text-muted">{t('عند استدعاء دفعة: هنا يظهر ما وصل لهذا العميل من كل دفعة.', 'For a recall: what this customer received.')}</p>
          {!lots.data?.length ? (
            <p className="px-5 pb-4 pt-2 text-sm text-muted">{lots.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا شيء بعد.', 'Nothing yet.')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {lots.data.map((l, i) => (
                <li key={i}>
                  <Link to={`/invoices/${l.invoiceId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-brand-50">
                    <span className="font-bold" dir="ltr">{l.lotCode ?? '—'}</span>
                    <span className="flex-1">{nameOf(products.get(l.productId))}</span>
                    <span className="text-sm text-muted">
                      {l.invoiceNo} · {formatDate(l.date)}
                      {l.expiryDate ? ` · ${t('تنتهي', 'exp.')} ${formatDate(l.expiryDate)}` : ''}
                    </span>
                    <span className="num font-bold">{formatQty(l.qty)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editing && <CustomerFormModal customer={customer} channels={data.channels} onClose={() => setEditing(false)} />}
      {paying && (
        <CustomerPaymentModal
          customerId={id}
          invoices={invoices.filter((i) => i.status === 'issued')}
          invoiceInfo={invoiceInfo}
          balanceBaisa={b.dueBaisa}
          onClose={() => setPaying(false)}
        />
      )}
      {dialog}
    </>
  )
}
