import { AlertTriangle, ChevronLeft, Clock, Factory, HandCoins, LayoutDashboard, PackageMinus, ReceiptText } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { initialPeriod, PeriodFilter, resolvePeriod } from '../../components/PeriodFilter'
import { FormError, Segmented } from '../../components/form'
import { Card, EmptyState, LinkButton, PageHeader } from '../../components/ui'
import { DASHBOARD_KEY, fetchDashboard } from '../../data/dashboard'
import { serverError } from '../../data/errors'
import { EXPENSES_KEY, fetchExpenses } from '../../data/expenses'
import { fetchSuppliers, SUPPLIERS_KEY } from '../../data/inventory'
import { fetchSales, SALES_KEY } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { computeKpis, expensesByCategory, inventoryValue, monthlySeries, topChannels, topCustomers, topProducts } from '../../domain/dashboard'
import { forecastCash, lastFullMonths } from '../../domain/forecast'
import { formatOMR, ltr } from '../../domain/money'
import { type DateRange, inRange, monthsInRange } from '../../domain/periods'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { useStock } from '../inventory/useStock'
import { summarize } from '../sales/summary'
import { formatDate } from '../tasks/labels'
import { SERIES } from './chartTheme'
import { MonthlyChart } from './MonthlyChart'
import { RankList } from './RankList'

/**
 * Months shown in the trend charts: the selected range, never past the current
 * month; a period of one month or less widens to the last 6 months for context.
 */
function chartMonths(range: DateRange, earliest: string | undefined, today: string): string[] {
  const now = today.slice(0, 7)
  const from = range.from.startsWith('0000') ? (earliest ?? today) : range.from
  const toMonth = range.to.slice(0, 7) > now ? now : range.to.slice(0, 7)
  let months = monthsInRange({ from, to: `${toMonth}-01` }).filter((m) => m <= now)
  if (months.length < 2) {
    const [y, m] = toMonth.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 10)
    months = monthsInRange({ from: start, to: `${toMonth}-01` })
  }
  return months.slice(-12)
}

const pct = (v: number | null) => (v == null ? '—' : ltr(`${Math.round(v * 100)}%`))

function Kpi({ label, value, sub, tone, to }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad'; to?: string }) {
  const color = tone === 'good' ? 'text-palm' : tone === 'bad' ? 'text-red-700' : 'text-ink'
  const body = (
    <div className="h-full rounded-2xl border border-line bg-card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`num mt-1 text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
  return to ? (
    <Link to={to} className="block rounded-2xl hover:ring-2 hover:ring-brand-200">
      {body}
    </Link>
  ) : (
    body
  )
}

/** One alert line: what needs attention, how many, and where to fix it. */
function AlertLink({ icon: Icon, label, count, to, red }: { icon: typeof Clock; label: string; count: ReactNode; to: string; red?: boolean }) {
  return (
    <Link to={to} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 ${red ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
      <Icon className="size-5 shrink-0" />
      <span className="flex-1">{label}</span>
      <span className="num font-bold">{count}</span>
      <ChevronLeft className="size-4 opacity-60 ltr:rotate-180" />
    </Link>
  )
}

function Line({ label, value, sub, strong }: { label: ReactNode; value: number; sub?: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${strong ? 'border-t border-line font-bold' : ''}`}>
      <span>
        {label}
        {sub && <span className="block text-xs font-normal text-muted">{sub}</span>}
      </span>
      <span className="num shrink-0">{formatOMR(value)}</span>
    </div>
  )
}

export function DashboardPage() {
  const dash = useQuery(DASHBOARD_KEY, fetchDashboard)
  const sales = useQuery(SALES_KEY, fetchSales)
  const suppliers = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const expenses = useQuery(EXPENSES_KEY, fetchExpenses)
  const stock = useStock()
  const settings = useSettingsQuery().data
  const [period, setPeriod] = useState(initialPeriod())
  const [horizon, setHorizon] = useState<'1' | '3'>('1')
  const today = todayIso()

  if (!dash.data) {
    return (
      <>
        <PageHeader title={t('لوحة المؤشرات', 'Dashboard')} />
        {dash.error ? <FormError message={serverError(dash.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }

  const input = dash.data
  const range = resolvePeriod(period)
  const k = computeKpis(input, range)
  const stockValue = inventoryValue(input.items)
  const earliest = [...input.invoices, ...input.expenses, ...input.customerPayments, ...input.supplierPayments].map((r) => r.date).sort()[0]
  const monthly = monthlySeries(input, chartMonths(range, earliest, today))
  const itemById = new Map((stock.items.data ?? []).map((i) => [i.id, i]))
  const customerById = new Map((sales.data?.customers ?? []).map((c) => [c.id, c]))
  const channelById = new Map((sales.data?.channels ?? []).map((c) => [c.id, c]))
  const categoryById = new Map((expenses.data?.categories ?? []).map((c) => [c.id, c]))
  const hasActivity = input.invoices.length + input.expenses.length + input.batches.length + input.purchases.length > 0

  // What is owed, with payments matched to invoices as on the sales pages
  const info = sales.data ? summarize(sales.data, today).invoiceInfo : new Map()
  const open = (sales.data?.invoices ?? [])
    .filter((i) => i.status === 'issued')
    .map((i) => ({ dueDate: i.dueDate, leftBaisa: i.totalBaisa - (info.get(i.id)?.paidBaisa ?? 0) }))
    .filter((i) => i.leftBaisa > 0)
  const receivable = open.reduce((s, i) => s + i.leftBaisa, 0)
  const overdue = open.filter((i) => i.dueDate && i.dueDate < today).reduce((s, i) => s + i.leftBaisa, 0)
  const payable = (suppliers.data ?? []).reduce((s, x) => s + Math.max(x.dueBaisa, 0), 0)

  const past = lastFullMonths(today)
  const monthTotal = (rows: Array<{ date: string }>, amount: (r: never) => number) => (m: string) =>
    rows.filter((r) => inRange(r.date, { from: `${m}-01`, to: `${m}-31` })).reduce((s, r) => s + amount(r as never), 0)
  const fc = forecastCash({
    today,
    months: Number(horizon),
    openInvoices: open,
    salesByMonth: past.map(monthTotal(input.invoices, (i: { totalBaisa: number }) => i.totalBaisa)),
    expensesByMonth: past.map(monthTotal(input.expenses, (e: { amountBaisa: number }) => e.amountBaisa)),
    invoiceDueDays: settings?.invoiceDueDays ?? 15,
    payableBaisa: payable,
  })

  const { alerts } = stock
  const anyAlert = alerts.expiredLots.length + alerts.expiringLots.length + alerts.low.length > 0 || overdue > 0

  return (
    <>
      <PageHeader title={t('لوحة المؤشرات', 'Dashboard')} />

      {anyAlert && (
        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          {overdue > 0 && <AlertLink icon={HandCoins} label={t('ديون متأخرة على العملاء', 'Overdue customer debts')} count={formatOMR(overdue)} to="/receivables" red />}
          {alerts.expiredLots.length > 0 && <AlertLink icon={AlertTriangle} label={t('دفعات منتهية فيها رصيد', 'Expired lots with stock')} count={alerts.expiredLots.length} to="/inventory" red />}
          {alerts.expiringLots.length > 0 && <AlertLink icon={Clock} label={t('دفعات قريبة الانتهاء', 'Lots expiring soon')} count={alerts.expiringLots.length} to="/inventory" />}
          {alerts.low.length > 0 && <AlertLink icon={PackageMinus} label={t('أصناف مخزونها منخفض', 'Items low on stock')} count={alerts.low.length} to="/inventory" />}
        </div>
      )}

      <div className="mb-5">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {!hasActivity && (
        <Card className="mb-5">
          <EmptyState
            icon={LayoutDashboard}
            title={t('لا توجد بيانات بعد', 'No data yet')}
            description={t('تظهر المؤشرات هنا بعد تسجيل المشتريات ودفعات الإنتاج والفواتير والمصروفات.', 'Indicators appear here once purchases, production batches, invoices and expenses are recorded.')}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton to="/production/new" variant="secondary">
              <Factory className="size-4" /> {t('دفعة إنتاج', 'Production batch')}
            </LinkButton>
            <LinkButton to="/invoices/new" variant="secondary">
              <ReceiptText className="size-4" /> {t('فاتورة', 'Invoice')}
            </LinkButton>
          </div>
        </Card>
      )}

      {/* Profit for the period (invoice dates) */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t('الإيرادات (بدون ضريبة)', 'Revenue (excl. VAT)')}
          value={formatOMR(k.revenueBaisa)}
          sub={t(`${k.invoiceCount} فاتورة، ${formatQty(k.unitsSold)} عبوة`, `${k.invoiceCount} invoices, ${formatQty(k.unitsSold)} jars`)}
          to="/sales?tab=invoices"
        />
        <Kpi label={t('المصروفات', 'Expenses')} value={formatOMR(k.expensesBaisa)} sub={t('إيجار ورواتب وكهرباء وغيرها', 'Rent, salaries, power and more')} to="/expenses" />
        <Kpi
          label={t('صافي الربح', 'Net profit')}
          value={formatOMR(k.netProfitBaisa)}
          tone={k.netProfitBaisa > 0 ? 'good' : k.netProfitBaisa < 0 ? 'bad' : undefined}
          sub={t(`هامش الربح ${pct(k.netMargin)} — بعد تكلفة البضاعة ${formatOMR(k.cogsBaisa)} والمصروفات`, `Margin ${pct(k.netMargin)} — after goods sold ${formatOMR(k.cogsBaisa)} and expenses`)}
        />
        <Kpi
          label={t('متوسط تكلفة العبوة المنتجة', 'Average cost per jar made')}
          value={k.avgUnitCostBaisa == null ? '—' : formatOMR(k.avgUnitCostBaisa)}
          sub={k.unitsProduced ? t(`${formatQty(k.unitsProduced)} عبوة في الفترة`, `${formatQty(k.unitsProduced)} jars in the period`) : t('لا إنتاج في الفترة', 'No production in the period')}
          to="/production"
        />
      </div>
      {/* Position today */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          label={t('قيمة المخزون الآن', 'Stock value now')}
          value={formatOMR(stockValue.total)}
          sub={t(`مواد ${formatOMR(stockValue.raw + stockValue.packaging)}، منتج جاهز ${formatOMR(stockValue.finished)}`, `Materials ${formatOMR(stockValue.raw + stockValue.packaging)}, ready ${formatOMR(stockValue.finished)}`)}
          to="/ready"
        />
        <Kpi label={t('المستحق لي (على العملاء)', 'Owed to me (customers)')} value={formatOMR(receivable)} tone={overdue > 0 ? 'bad' : undefined} sub={overdue > 0 ? t(`منها متأخر ${formatOMR(overdue)}`, `${formatOMR(overdue)} overdue`) : undefined} to="/receivables" />
        <Kpi label={t('المستحق عليّ (للموردين)', 'Owed by me (suppliers)')} value={formatOMR(payable)} to="/receivables" />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <MonthlyChart
          title={t('الإيرادات والتكاليف وصافي الربح شهرياً', 'Monthly revenue, costs and net profit')}
          rows={monthly}
          series={[
            { key: 'revenueBaisa', label: t('الإيرادات', 'Revenue'), color: SERIES.in, kind: 'bar' },
            { key: 'costsBaisa', label: t('التكاليف (بضاعة مباعة + مصروفات)', 'Costs (goods sold + expenses)'), color: SERIES.out, kind: 'bar' },
            { key: 'netProfitBaisa', label: t('صافي الربح', 'Net profit'), color: SERIES.net, kind: 'line' },
          ]}
        />
        <MonthlyChart
          title={t('التدفق النقدي الشهري', 'Monthly cash flow')}
          rows={monthly}
          series={[
            { key: 'cashInBaisa', label: t('داخل (مقبوضات العملاء)', 'In (customer payments)'), color: SERIES.in, kind: 'bar' },
            { key: 'cashOutBaisa', label: t('خارج (للموردين + مصروفات)', 'Out (suppliers + expenses)'), color: SERIES.out, kind: 'bar' },
            { key: 'netCashBaisa', label: t('الصافي', 'Net'), color: SERIES.net, kind: 'line' },
          ]}
        />
      </div>

      {/* Cash forecast: an estimate, so every assumption is on screen */}
      <Card className="mb-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="flex-1 font-bold">{t('توقع التدفق النقدي', 'Cash forecast')}</h2>
          <Segmented<'1' | '3'>
            value={horizon}
            onChange={setHorizon}
            options={[
              { value: '1', label: t('شهر', '1 month') },
              { value: '3', label: t('3 أشهر', '3 months') },
            ]}
          />
        </div>
        <p className="mb-3 text-sm text-muted">{t(`من اليوم حتى ${formatDate(fc.until)}. تقدير مبني على الأرقام المسجّلة، وليس رصيد البنك.`, `From today to ${formatDate(fc.until)}. An estimate from recorded figures, not the bank balance.`)}</p>
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-bold text-palm">{t('داخل متوقع', 'Expected in')}</h3>
            <Line label={t('فواتير يحل استحقاقها في الفترة', 'Invoices falling due')} value={fc.dueBaisa} />
            <Line label={t('فواتير متأخرة', 'Overdue invoices')} sub={t('قد لا تُحصَّل كلها', 'May not all be collected')} value={fc.overdueBaisa} />
            <Line
              label={t('مبيعات جديدة', 'New sales')}
              sub={t(
                `متوسط آخر 3 أشهر كاملة، ونسبة ${Math.round(fc.newSalesShare * 100)}% منها تُحصَّل داخل الفترة (الاستحقاق بعد ${settings?.invoiceDueDays ?? 15} يوماً)`,
                `Average of the last 3 full months; ${Math.round(fc.newSalesShare * 100)}% is collected inside the window (due after ${settings?.invoiceDueDays ?? 15} days)`,
              )}
              value={fc.newSalesBaisa}
            />
            <Line label={t('مجموع الداخل', 'Total in')} value={fc.inBaisa} strong />
          </div>
          <div>
            <h3 className="mb-1 mt-4 text-sm font-bold text-red-700 md:mt-0">{t('خارج متوقع', 'Expected out')}</h3>
            <Line label={t('المستحق للموردين الآن', 'Owed to suppliers now')} value={fc.payableBaisa} />
            <Line label={t('مصروفات', 'Expenses')} sub={t('متوسط آخر 3 أشهر كاملة', 'Average of the last 3 full months')} value={fc.expensesBaisa} />
            <Line label={t('مجموع الخارج', 'Total out')} value={fc.outBaisa} strong />
          </div>
        </div>
        <div className={`mt-4 flex items-baseline justify-between gap-3 rounded-xl px-4 py-3 text-lg font-bold ${fc.netBaisa >= 0 ? 'bg-brand-50' : 'bg-red-50 text-red-800'}`}>
          <span>{fc.netBaisa >= 0 ? t('الفائض المتوقع', 'Expected surplus') : t('العجز المتوقع', 'Expected shortfall')}</span>
          <span className="num">{formatOMR(Math.abs(fc.netBaisa))}</span>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <RankList
          title={t('أفضل العملاء', 'Top customers')}
          empty={t('لا مبيعات في هذه الفترة.', 'No sales in this period.')}
          rows={topCustomers(input, range).map((r) => ({ key: r.key, label: customerById.get(r.key)?.name ?? '—', value: r.total, display: formatOMR(r.total), to: `/customers/${r.key}` }))}
        />
        <RankList
          title={t('أفضل المنتجات', 'Top products')}
          empty={t('لا مبيعات في هذه الفترة.', 'No sales in this period.')}
          rows={topProducts(input, range).map((p) => ({
            key: p.itemId,
            label: nameOf(itemById.get(p.itemId)),
            value: p.revenueBaisa,
            display: formatOMR(p.revenueBaisa),
            sub: t(`${formatQty(p.qty)} عبوة`, `${formatQty(p.qty)} jars`),
            to: `/products/${p.itemId}`,
          }))}
        />
        <RankList
          title={t('أفضل القنوات', 'Top channels')}
          empty={t('لا مبيعات في هذه الفترة.', 'No sales in this period.')}
          rows={topChannels(input, range).map((c) => ({
            key: c.key || 'none',
            label: channelById.get(c.key)?.name ?? t('بلا قناة', 'No channel'),
            value: c.total,
            display: formatOMR(c.total),
            sub: k.revenueBaisa ? pct(c.total / k.revenueBaisa) : undefined,
          }))}
        />
        <RankList
          title={t('المصروفات حسب التصنيف', 'Expenses by category')}
          empty={t('لا مصروفات في هذه الفترة.', 'No expenses in this period.')}
          rows={expensesByCategory(input, range).map((c) => ({
            key: c.key,
            label: nameOf(categoryById.get(c.key)),
            value: c.total,
            display: formatOMR(c.total),
            sub: k.expensesBaisa ? pct(c.total / k.expensesBaisa) : undefined,
            to: '/expenses',
          }))}
        />
      </div>
    </>
  )
}
