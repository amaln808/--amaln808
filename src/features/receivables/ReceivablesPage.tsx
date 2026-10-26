import { ChevronLeft, HandCoins, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { FormError } from '../../components/form'
import { Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchSuppliers, SUPPLIERS_KEY } from '../../data/inventory'
import { fetchSales, markReminded, SALES_KEY } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { type AgingBucket, agingBucket, agingTable, BUCKETS, type OpenInvoice, reminderMessage } from '../../domain/aging'
import { formatOMR } from '../../domain/money'
import { toWhatsAppNumber } from '../../domain/sales'
import { t } from '../../i18n/index'
import { summarize } from '../sales/summary'
import { formatDate } from '../tasks/labels'

function bucketLabel(b: AgingBucket): string {
  return {
    current: t('لم يستحق', 'Not due'),
    d1_30: t('1–30 يوماً', '1–30 days'),
    d31_60: t('31–60', '31–60'),
    d61_90: t('61–90', '61–90'),
    d90: t('أكثر من 90', '90+'),
  }[b]
}

/** Who owes the factory, how late, with a ready WhatsApp reminder — and what the factory owes its suppliers. */
export function ReceivablesPage() {
  const sales = useQuery(SALES_KEY, fetchSales)
  const suppliers = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const settings = useSettingsQuery().data
  const today = todayIso()
  const data = sales.data

  const info = data ? summarize(data, today).invoiceInfo : new Map()
  const open: OpenInvoice[] = (data?.invoices ?? [])
    .filter((i) => i.status === 'issued')
    .map((i) => ({ id: i.id, customerId: i.customerId, invoiceNo: i.invoiceNo, dueDate: i.dueDate, leftBaisa: i.totalBaisa - (info.get(i.id)?.paidBaisa ?? 0) }))
    .filter((i) => i.leftBaisa > 0)
  const { byCustomer, all } = agingTable(open, today)
  const rows = (data?.customers ?? [])
    .filter((c) => byCustomer.has(c.id))
    .map((c) => ({ customer: c, totals: byCustomer.get(c.id)! }))
    .sort((a, b) => b.totals.total - b.totals.current - (a.totals.total - a.totals.current) || b.totals.total - a.totals.total)
  const owedToSuppliers = (suppliers.data ?? []).filter((s) => s.dueBaisa > 0).sort((a, b) => b.dueBaisa - a.dueBaisa)
  const supplierTotal = owedToSuppliers.reduce((s, x) => s + x.dueBaisa, 0)
  const company = settings?.companyName ?? 'زوردة'

  const remind = (customerId: string, name: string, phone: string | null) => {
    const late = open.filter((i) => i.customerId === customerId && agingBucket(i.dueDate, today) !== 'current')
    const list = late.length ? late : open.filter((i) => i.customerId === customerId)
    const number = toWhatsAppNumber(phone ?? undefined)
    window.open(`https://wa.me/${number ?? ''}?text=${encodeURIComponent(reminderMessage(name, list, company, today))}`, '_blank')
    markReminded(customerId).catch(() => {})
  }

  return (
    <>
      <PageHeader title={t('المستحقات', 'Receivables')} subtitle={t('أعمار الديون تُحسب من تاريخ استحقاق كل فاتورة.', 'Debt age is counted from each invoice due date.')} />
      {sales.error && !data && <FormError message={serverError(sales.error)} />}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t('مستحق لي من العملاء', 'Owed to me')} value={formatOMR(all.total)} />
        <Stat label={t('منه متأخر', 'Of which late')} value={formatOMR(all.total - all.current)} tone={all.total - all.current > 0 ? 'red' : undefined} />
        <Stat label={t('مستحق عليّ للموردين', 'I owe suppliers')} value={formatOMR(supplierTotal)} />
      </div>

      <Card className="mb-5 p-0">
        <h2 className="px-5 pt-4 text-lg font-bold">{t('أعمار ديون العملاء', 'Customer debt by age')}</h2>
        <div className="grid grid-cols-5 gap-2 px-5 pt-3 text-center">
          {BUCKETS.map((b) => (
            <div key={b} className={`rounded-xl px-1 py-2 ${b !== 'current' && all[b] > 0 ? 'bg-red-50 text-red-800' : 'bg-stone-50'}`}>
              <div className="text-xs">{bucketLabel(b)}</div>
              <div className="num text-sm font-bold">{formatOMR(all[b])}</div>
            </div>
          ))}
        </div>
        {!rows.length ? (
          <EmptyState icon={HandCoins} title={sales.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد مبالغ مستحقة', 'Nothing owed')} />
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {rows.map(({ customer: c, totals }) => {
              const late = totals.total - totals.current
              return (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link to={`/customers/${c.id}`} className="min-w-0 flex-1 hover:text-brand-800">
                      <div className="font-bold">{c.name}</div>
                      <div className="text-sm text-muted">
                        {c.lastReminderAt ? t(`آخر تذكير ${formatDate(c.lastReminderAt.slice(0, 10))}`, `Last reminded ${formatDate(c.lastReminderAt.slice(0, 10))}`) : t('لم يُرسل تذكير', 'Not reminded yet')}
                      </div>
                    </Link>
                    <div className="text-end">
                      <div className="num font-bold">{formatOMR(totals.total)}</div>
                      {late > 0 && <div className="num text-xs font-bold text-red-700">{t(`متأخر ${formatOMR(late)}`, `${formatOMR(late)} late`)}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => remind(c.id, c.name, c.phone)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-medium text-white"
                    >
                      <MessageCircle className="size-4" />
                      {t('تذكير واتساب', 'WhatsApp reminder')}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {BUCKETS.filter((b) => totals[b] > 0).map((b) => (
                      <span key={b} className={`rounded-lg px-2 py-1 ${b === 'current' ? 'bg-stone-100' : 'bg-red-50 text-red-800'}`}>
                        {bucketLabel(b)}: <span className="num font-bold">{formatOMR(totals[b])}</span>
                      </span>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <h2 className="px-5 pt-4 text-lg font-bold">{t('المستحق للموردين', 'Owed to suppliers')}</h2>
        {!owedToSuppliers.length ? (
          <p className="px-5 pb-4 pt-2 text-sm text-muted">{t('لا يوجد مستحق للموردين.', 'Nothing owed to suppliers.')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {owedToSuppliers.map((s) => (
              <li key={s.id}>
                <Link to={`/suppliers/${s.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-brand-50">
                  <span className="flex-1 font-medium">{s.name}</span>
                  <span className="num font-bold">{formatOMR(s.dueBaisa)}</span>
                  <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
