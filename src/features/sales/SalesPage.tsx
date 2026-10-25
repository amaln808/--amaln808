import { ChevronLeft, FileText, Plus, ReceiptText, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FormError, Segmented } from '../../components/form'
import { Badge, Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { fetchSales, SALES_KEY } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { formatOMR } from '../../domain/money'
import { t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'
import { CustomerFormModal } from './CustomerFormModal'
import { PricesPanel } from './PricesPanel'
import { type CustomerBalance, INVOICE_TONE, type InvoiceInfo, invoiceStatusLabel, QUOTE_TONE, quoteStatusLabel, quoteStatusOf, summarize } from './summary'

type Tab = 'invoices' | 'quotes' | 'customers' | 'prices'

export function SalesPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'invoices'
  const setTab = (v: Tab) => setParams({ tab: v }, { replace: true })
  const q = useQuery(SALES_KEY, fetchSales)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const [addingCustomer, setAddingCustomer] = useState(false)
  const today = todayIso()
  const data = q.data
  const sum = data ? summarize(data, today) : null
  const invoiceInfo = sum?.invoiceInfo ?? new Map<string, InvoiceInfo>()
  const balances = sum?.balances ?? new Map<string, CustomerBalance>()
  const customerName = new Map((data?.customers ?? []).map((c) => [c.id, c.name]))
  const channelName = new Map((data?.channels ?? []).map((c) => [c.id, c.name]))

  const month = today.slice(0, 7)
  const monthSales = (data?.invoices ?? [])
    .filter((i) => i.status === 'issued' && i.date.startsWith(month))
    .reduce((s, i) => s + i.subtotalBaisa - i.discountBaisa, 0)
  const due = [...balances.values()].reduce((s, b) => s + Math.max(b.dueBaisa, 0), 0)
  const overdue = [...balances.values()].reduce((s, b) => s + b.overdueBaisa, 0)

  return (
    <>
      <PageHeader
        title={t('العملاء والمبيعات', 'Customers & sales')}
        actions={
          <>
            <Link to="/quotes/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4">
              <FileText className="size-5" />
              {t('عرض سعر', 'Quotation')}
            </Link>
            <Link to="/invoices/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 font-medium text-on-brand">
              <Plus className="size-5" />
              {t('فاتورة', 'Invoice')}
            </Link>
          </>
        }
      />
      {q.error && !data && <FormError message={serverError(q.error)} />}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t('مبيعات هذا الشهر (بدون ضريبة)', 'Sales this month (excl. VAT)')} value={formatOMR(monthSales)} />
        <Stat label={t('مستحق من العملاء', 'Owed by customers')} value={formatOMR(due)} />
        <Stat label={t('منها متأخر', 'Of which overdue')} value={formatOMR(overdue)} tone={overdue > 0 ? 'red' : undefined} />
      </div>
      <div className="mb-5">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'invoices', label: t('الفواتير', 'Invoices') },
            { value: 'quotes', label: t('عروض الأسعار', 'Quotations') },
            { value: 'customers', label: t('العملاء', 'Customers') },
            { value: 'prices', label: t('الأسعار', 'Prices') },
          ]}
        />
      </div>

      {tab === 'invoices' && (
        <Card className="p-0">
          {!data?.invoices.length ? (
            <EmptyState
              icon={ReceiptText}
              title={q.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد فواتير بعد', 'No invoices yet')}
              description={t('الفاتورة تصدر من عرض سعر مقبول، أو مباشرة بزر «فاتورة».', 'Invoices come from an accepted quotation, or directly with «Invoice».')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.invoices.map((i) => {
                const info = invoiceInfo.get(i.id)
                return (
                  <li key={i.id}>
                    <Link to={`/invoices/${i.id}`} className={`flex items-center gap-4 px-5 py-4 hover:bg-brand-50 ${i.status === 'void' ? 'opacity-60' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-bold ${i.status === 'void' ? 'line-through' : ''}`} dir="ltr">{i.invoiceNo}</span>
                          <span>{customerName.get(i.customerId)}</span>
                          {info && <Badge tone={INVOICE_TONE[info.status]}>{invoiceStatusLabel(info.status)}</Badge>}
                        </div>
                        <div className="mt-1 text-sm text-muted">
                          {formatDate(i.date)}
                          {i.status === 'issued' && i.dueDate ? ` · ${t('تستحق', 'due')} ${formatDate(i.dueDate)}` : ''}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="num font-bold">{formatOMR(i.totalBaisa)}</div>
                        {info && info.status !== 'void' && info.status !== 'paid' && info.paidBaisa > 0 && (
                          <div className="num text-xs text-muted">{t(`المتبقي ${formatOMR(i.totalBaisa - info.paidBaisa)}`, `${formatOMR(i.totalBaisa - info.paidBaisa)} left`)}</div>
                        )}
                      </div>
                      <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'quotes' && (
        <Card className="p-0">
          {!data?.quotations.length ? (
            <EmptyState
              icon={FileText}
              title={q.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد عروض أسعار بعد', 'No quotations yet')}
              description={t('العرض لا يمس المخزون؛ عند «تم القبول» يتحول إلى فاتورة برقم تسلسلي.', 'A quotation does not touch stock; «Accepted» turns it into a numbered invoice.')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.quotations.map((x) => {
                const s = quoteStatusOf(x, today)
                return (
                  <li key={x.id}>
                    <Link to={`/quotes/${x.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-brand-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold" dir="ltr">{x.quoteNo}</span>
                          <span>{customerName.get(x.customerId)}</span>
                          <Badge tone={QUOTE_TONE[s]}>{quoteStatusLabel(s)}</Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted">
                          {formatDate(x.date)}
                          {x.validUntil && (s === 'draft' || s === 'sent') ? ` · ${t('ساري حتى', 'valid until')} ${formatDate(x.validUntil)}` : ''}
                        </div>
                      </div>
                      <div className="num font-bold">{formatOMR(x.totalBaisa)}</div>
                      <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'customers' && (
        <Card className="p-0">
          <div className="flex justify-end px-5 pt-4">
            <Button variant="secondary" onClick={() => setAddingCustomer(true)}>
              <Plus className="size-5" />
              {t('عميل جديد', 'New customer')}
            </Button>
          </div>
          {!data?.customers.length ? (
            <EmptyState icon={Users} title={q.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا يوجد عملاء بعد', 'No customers yet')} />
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {data.customers
                .filter((c) => c.active)
                .map((c) => {
                  const b = balances.get(c.id)
                  return (
                    <li key={c.id}>
                      <Link to={`/customers/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-brand-50">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-sm text-muted">{[c.channelId ? channelName.get(c.channelId) : null, c.phone].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="text-end">
                          <div className={`num font-bold ${b && b.overdueBaisa > 0 ? 'text-red-700' : ''}`}>{formatOMR(b?.dueBaisa ?? 0)}</div>
                          <div className="text-xs text-muted">{b && b.overdueBaisa > 0 ? t('منه متأخر', 'part overdue') : t('مستحق', 'owed')}</div>
                        </div>
                        <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                      </Link>
                    </li>
                  )
                })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'prices' && data && <PricesPanel data={data} products={(items.data ?? []).filter((i) => i.type === 'finished' && i.active)} />}

      {addingCustomer && <CustomerFormModal channels={data?.channels ?? []} onClose={() => setAddingCustomer(false)} />}
    </>
  )
}
