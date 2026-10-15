import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronLeft, Factory, LayoutDashboard, ReceiptText } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { initialPeriod, PeriodFilter, resolvePeriod } from '../../components/PeriodFilter'
import { Card, EmptyState, LinkButton, PageHeader } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import {
  computeKpis,
  type DashboardInput,
  expensesByCategory,
  inventoryValue,
  lowStockItems,
  monthlySeries,
  outstanding,
  topCustomers,
  topProducts,
} from '../../domain/dashboard'
import { formatOMR, ltr } from '../../domain/money'
import { type DateRange, monthsInRange } from '../../domain/periods'
import { formatQty } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { SERIES } from './chartTheme'
import { MonthlyChart } from './MonthlyChart'
import { RankList } from './RankList'

async function loadAll() {
  const [items, invoices, customerPayments, supplierPayments, purchases, expenses, batches, customers, categories] =
    await Promise.all([
      db.items.toArray(),
      db.salesInvoices.toArray(),
      db.customerPayments.toArray(),
      db.supplierPayments.toArray(),
      db.purchases.toArray(),
      db.expenses.toArray(),
      db.productionBatches.toArray(),
      db.customers.toArray(),
      db.expenseCategories.toArray(),
    ])
  return { items, invoices, customerPayments, supplierPayments, purchases, expenses, batches, customers, categories }
}

/**
 * Months shown in the trend charts: the selected range, never past the current
 * month; a period of one month or less widens to the last 6 months for context.
 */
function chartMonths(range: DateRange, earliest: string | undefined): string[] {
  const now = today().slice(0, 7)
  const from = range.from.startsWith('0000') ? (earliest ?? today()) : range.from
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
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : 'text-stone-900'
  const body = (
    <div className="h-full rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-stone-500">{label}</div>
      <div className={`num mt-1 text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
    </div>
  )
  return to ? <Link to={to} className="block transition hover:-translate-y-0.5">{body}</Link> : body
}

export function DashboardPage() {
  const data = useLiveQuery(loadAll, [])
  const [period, setPeriod] = useState(initialPeriod())

  if (!data) return null
  const range = resolvePeriod(period)
  const input = data as unknown as DashboardInput
  const k = computeKpis(input, range)
  const stock = inventoryValue(data.items)
  const owed = outstanding(input)
  const low = lowStockItems(data.items)
  const earliest = [...data.invoices, ...data.expenses, ...data.customerPayments, ...data.supplierPayments]
    .map((r) => r.date)
    .sort()[0]
  const months = chartMonths(range, earliest)
  const monthly = monthlySeries(input, months)
  const itemById = new Map(data.items.map((i) => [i.id, i]))
  const customerById = new Map(data.customers.map((c) => [c.id, c]))
  const categoryById = new Map(data.categories.map((c) => [c.id, c]))
  const hasActivity = data.invoices.length + data.expenses.length + data.batches.length + data.purchases.length > 0

  return (
    <>
      <PageHeader title={ar.nav.dashboard} />
      <div className="mb-5">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {!hasActivity && (
        <Card className="mb-5">
          <EmptyState
            icon={LayoutDashboard}
            title="لا توجد بيانات بعد"
            description="ستظهر المؤشرات هنا عندما تسجّل المشتريات ودفعات الإنتاج والفواتير والمصروفات."
          />
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton to="/production/new" variant="secondary"><Factory className="size-4" /> دفعة إنتاج</LinkButton>
            <LinkButton to="/invoices/new" variant="secondary"><ReceiptText className="size-4" /> فاتورة</LinkButton>
          </div>
        </Card>
      )}

      {/* Profit for the period */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="الإيرادات" value={formatOMR(k.revenueBaisa)} sub={<>{k.invoiceCount} فاتورة · {formatQty(k.unitsSold)} عبوة</>} />
        <Kpi
          label="صافي الربح"
          value={formatOMR(k.netProfitBaisa)}
          tone={k.netProfitBaisa > 0 ? 'good' : k.netProfitBaisa < 0 ? 'bad' : undefined}
          sub={<>هامش صافي الربح {pct(k.netMargin)}</>}
        />
        <Kpi label="مجمل الربح" value={formatOMR(k.grossProfitBaisa)} sub={<>بعد تكلفة البضاعة المباعة · هامش {pct(k.grossMargin)}</>} />
        <Kpi label="المصروفات" value={formatOMR(k.expensesBaisa)} sub="إيجار، رواتب، كهرباء…" to="/expenses" />
      </div>
      {/* Current position */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="متوسط تكلفة العبوة"
          value={k.avgUnitCostBaisa == null ? '—' : formatOMR(k.avgUnitCostBaisa)}
          sub={k.unitsProduced ? <>{formatQty(k.unitsProduced)} عبوة منتجة في الفترة</> : 'لا إنتاج في الفترة'}
          to="/production"
        />
        <Kpi
          label="قيمة المخزون الحالية"
          value={formatOMR(stock.total)}
          sub={<>خام {formatOMR(stock.raw)} · تغليف {formatOMR(stock.packaging)} · منتج {formatOMR(stock.finished)}</>}
          to="/inventory"
        />
        <Kpi label="مستحق لنا (على العملاء)" value={formatOMR(owed.receivableBaisa)} tone={owed.receivableBaisa > 0 ? 'bad' : undefined} to="/customers" />
        <Kpi label="مستحق علينا (للموردين)" value={formatOMR(owed.payableBaisa)} to="/suppliers" />
      </div>

      {low.length > 0 && (
        <Card className="mb-5 border-red-200 bg-red-50/40">
          <h2 className="mb-2 flex items-center gap-2 font-bold text-red-800">
            <AlertTriangle className="size-5" /> تنبيهات المخزون المنخفض ({low.length})
          </h2>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {low.map((i) => {
              const item = data.items.find((x) => x.id === i.id)!
              return (
                <li key={i.id}>
                  <Link to={`/inventory/${i.id}`} className="flex min-h-11 items-center justify-between gap-2 border-b border-red-100 text-sm">
                    <span>{item.name}</span>
                    <span className="flex items-center gap-1 text-red-700">
                      <span className="num">{formatQty(item.qtyOnHand, item.unit)}</span>
                      <span className="text-xs text-stone-500">/ حد {formatQty(item.minQty)}</span>
                      <ChevronLeft className="size-4 text-stone-400" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <MonthlyChart
          title="الإيرادات والتكاليف وصافي الربح شهرياً"
          rows={monthly}
          series={[
            { key: 'revenueBaisa', label: 'الإيرادات', color: SERIES.in, kind: 'bar' },
            { key: 'costsBaisa', label: 'التكاليف (بضاعة مباعة + مصروفات)', color: SERIES.out, kind: 'bar' },
            { key: 'netProfitBaisa', label: 'صافي الربح', color: SERIES.net, kind: 'line' },
          ]}
        />
        <MonthlyChart
          title="التدفق النقدي الشهري"
          rows={monthly}
          series={[
            { key: 'cashInBaisa', label: 'داخل (مقبوضات العملاء)', color: SERIES.in, kind: 'bar' },
            { key: 'cashOutBaisa', label: 'خارج (للموردين + مصروفات)', color: SERIES.out, kind: 'bar' },
            { key: 'netCashBaisa', label: 'الصافي', color: SERIES.net, kind: 'line' },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <RankList
          title="أفضل العملاء"
          empty="لا مبيعات في هذه الفترة."
          rows={topCustomers(input, range).map((r) => ({
            key: r.key,
            label: customerById.get(r.key)?.name ?? '—',
            value: r.total,
            display: formatOMR(r.total),
            to: `/customers/${r.key}`,
          }))}
        />
        <RankList
          title="أفضل المنتجات"
          empty="لا مبيعات في هذه الفترة."
          rows={topProducts(input, range).map((p) => ({
            key: p.itemId,
            label: itemById.get(p.itemId)?.name ?? '—',
            value: p.revenueBaisa,
            display: formatOMR(p.revenueBaisa),
            sub: <>{formatQty(p.qty)} عبوة</>,
            to: `/inventory/${p.itemId}`,
          }))}
        />
        <RankList
          title="المصروفات حسب التصنيف"
          empty="لا مصروفات في هذه الفترة."
          rows={expensesByCategory(input, range).map((c) => ({
            key: c.key,
            label: categoryById.get(c.key)?.name ?? '—',
            value: c.total,
            display: formatOMR(c.total),
            sub: k.expensesBaisa ? ltr(`${Math.round((c.total / k.expensesBaisa) * 100)}%`) : undefined,
            color: categoryById.get(c.key)?.color,
            to: '/expenses',
          }))}
        />
      </div>
    </>
  )
}
