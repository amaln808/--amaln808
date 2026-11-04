import { useState } from 'react'
import { useSettingsQuery } from '../../app/settingsContext'
import { Field, FormError, Select } from '../../components/form'
import { PageHeader, Stat } from '../../components/ui'
import { DASHBOARD_KEY, fetchDashboard } from '../../data/dashboard'
import { serverError } from '../../data/errors'
import { EXPENSES_KEY, fetchExpenses } from '../../data/expenses'
import { fetchItemsWithStock, fetchSuppliers, INVENTORY_KEY, SUPPLIERS_KEY } from '../../data/inventory'
import { fetchOrders, ORDERS_KEY } from '../../data/orders'
import { fetchSales, SALES_KEY } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { inventoryValue } from '../../domain/dashboard'
import { formatOMR } from '../../domain/money'
import { change, monthlyReport, previousMonth, recentMonths } from '../../domain/monthlyReport'
import { monthLabel } from '../../domain/periods'
import { formatQty } from '../../domain/quantity'
import { type DocLang, t } from '../../i18n/index'
import { PdfPanel } from '../documents/DocumentPanel'
import { MonthlyReportDocument, type ReportDocData } from '../documents/MonthlyReportDocument'
import { summarize } from '../sales/summary'

const changeText = (now: number, before: number) => {
  const c = change(now, before)
  return c == null ? t('لا مقارنة', 'No comparison') : t(`${c >= 0 ? '+' : '−'}${Math.abs(Math.round(c * 100))}% عن الشهر السابق`, `${c >= 0 ? '+' : '−'}${Math.abs(Math.round(c * 100))}% vs last month`)
}

/** One month of the factory in figures, against the month before, as a PDF to keep or send. */
export function MonthlyReportPage() {
  const dash = useQuery(DASHBOARD_KEY, fetchDashboard)
  const sales = useQuery(SALES_KEY, fetchSales)
  const orders = useQuery(ORDERS_KEY, fetchOrders)
  const suppliers = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const expenses = useQuery(EXPENSES_KEY, fetchExpenses)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const settings = useSettingsQuery().data
  const today = todayIso()
  const months = recentMonths(today, 12)
  const [month, setMonth] = useState(() => previousMonth(today.slice(0, 7)))
  const back = { to: '/', label: t('لوحة المؤشرات', 'Dashboard') }

  if (!dash.data || !sales.data || orders.loading) {
    return (
      <>
        <PageHeader title={t('التقرير الشهري', 'Monthly report')} back={back} />
        {dash.error ? <FormError message={serverError(dash.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }

  const input = dash.data
  const report = monthlyReport(input, month, { purchases: input.purchases.map((p) => ({ date: p.date ?? '', totalBaisa: p.totalBaisa })), orders: orders.data ?? [] })
  const k = report.now
  const p = report.before

  // Where things stand today, worked out as on the dashboard
  const sum = summarize(sales.data, today, orders.data ?? [])
  const open = [
    ...sales.data.invoices.filter((i) => i.status === 'issued').map((i) => ({ dueDate: i.dueDate, leftBaisa: i.totalBaisa - (sum.invoiceInfo.get(i.id)?.paidBaisa ?? 0) })),
    ...sum.owedOnOrders.map((o) => ({ dueDate: o.dueDate, leftBaisa: o.leftBaisa })),
  ].filter((i) => i.leftBaisa > 0)

  const productById = new Map((items.data ?? []).map((i) => [i.id, i]))
  const customerById = new Map(sales.data.customers.map((c) => [c.id, c]))
  const categoryById = new Map((expenses.data?.categories ?? []).map((c) => [c.id, c]))
  const doc: ReportDocData = {
    report,
    names: {
      product: (id) => [productById.get(id)?.name ?? '—', productById.get(id)?.nameEn ?? ''],
      customer: (id) => customerById.get(id)?.name ?? '—',
      category: (id) => [categoryById.get(id)?.name ?? '—', categoryById.get(id)?.nameEn ?? ''],
    },
    position: {
      receivableBaisa: open.reduce((s, i) => s + i.leftBaisa, 0),
      overdueBaisa: open.filter((i) => i.dueDate && i.dueDate < today).reduce((s, i) => s + i.leftBaisa, 0),
      payableBaisa: (suppliers.data ?? []).reduce((s, x) => s + Math.max(x.dueBaisa, 0), 0),
      stockBaisa: inventoryValue(input.items).total,
      openOrders: (orders.data ?? []).filter((o) => o.status === 'open').length,
    },
    issuedOn: today,
  }
  const net = k.cashInBaisa - k.cashOutBaisa
  const company = (lang: DocLang) => (settings ? (lang === 'en' ? settings.companyNameEn || settings.companyName : settings.companyName) : '')
  const shareText = (lang: DocLang) => {
    const ar = `التقرير الشهري لـ ${company('ar')} — ${monthLabel(month, 'ar')}`
    const en = `${company('en')} monthly report — ${monthLabel(month, 'en')}`
    return lang === 'ar' ? ar : lang === 'en' ? en : `${ar}\n${en}`
  }

  return (
    <>
      <PageHeader
        title={t('التقرير الشهري', 'Monthly report')}
        subtitle={t('أرباح الشهر ومبيعاته وإنتاجه ونقده مقارنةً بالشهر السابق، في ملف PDF للحفظ أو الإرسال.', "The month's profit, sales, production and cash against the month before, as a PDF to keep or send.")}
        back={back}
      />
      <div className="flex flex-col gap-5">
        <div className="max-w-xs">
          <Field label={t('الشهر', 'Month')}>
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                  {m === today.slice(0, 7) ? t(' (حتى اليوم)', ' (so far)') : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('الإيرادات', 'Revenue')} value={formatOMR(k.revenueBaisa)} hint={changeText(k.revenueBaisa, p.revenueBaisa)} />
          <Stat label={t('صافي الربح', 'Net profit')} value={formatOMR(k.netProfitBaisa)} tone={k.netProfitBaisa > 0 ? 'green' : k.netProfitBaisa < 0 ? 'red' : undefined} hint={changeText(k.netProfitBaisa, p.netProfitBaisa)} />
          <Stat label={t('صافي النقد', 'Net cash')} value={formatOMR(net)} tone={net < 0 ? 'red' : undefined} hint={t(`داخل ${formatOMR(k.cashInBaisa)} · خارج ${formatOMR(k.cashOutBaisa)}`, `In ${formatOMR(k.cashInBaisa)} · out ${formatOMR(k.cashOutBaisa)}`)} />
          <Stat label={t('عبوات منتجة', 'Jars made')} value={formatQty(k.unitsProduced)} hint={t(`المباع ${formatQty(k.unitsSold)}`, `Sold ${formatQty(k.unitsSold)}`)} />
        </div>
        {settings && (
          <PdfPanel
            settings={settings}
            dataKey={JSON.stringify({ report, position: doc.position, n: [items.data?.length, expenses.data?.categories.length] })}
            filename={(l) => (l === 'en' ? `Monthly report ${month}.pdf` : `التقرير الشهري ${month}.pdf`)}
            subject={t(`التقرير الشهري — ${monthLabel(month)}`, `Monthly report — ${monthLabel(month)}`)}
            shareText={shareText}
            fitUpTo={1.4}
            render={(ref, { company, images, lang }) => <MonthlyReportDocument ref={ref} data={doc} company={company} images={images} lang={lang} />}
          />
        )}
      </div>
    </>
  )
}
