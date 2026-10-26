import { Camera, ChevronLeft, Paperclip, Plus, ReceiptText, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FormError, TextInput } from '../../components/form'
import { initialPeriod, PeriodFilter, resolvePeriod } from '../../components/PeriodFilter'
import { Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { EXPENSES_KEY, fetchExpenses } from '../../data/expenses'
import { useQuery } from '../../data/useQuery'
import { formatOMR, ltr } from '../../domain/money'
import { inRange, totalsBy } from '../../domain/periods'
import { nameKey } from '../../domain/text'
import { nameOf, t } from '../../i18n/index'
import { methodLabel } from '../inventory/labels'
import { formatDate } from '../tasks/labels'

const FALLBACK = '#a8a29e'

export function ExpensesPage() {
  const q = useQuery(EXPENSES_KEY, fetchExpenses)
  const [period, setPeriod] = useState(initialPeriod())
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const data = q.data
  const catById = new Map((data?.categories ?? []).map((c) => [c.id, c]))
  const supplierById = new Map((data?.suppliers ?? []).map((s) => [s.id, s.name]))
  const range = resolvePeriod(period)
  const inPeriod = (data?.expenses ?? []).filter((e) => inRange(e.date, range))
  const term = nameKey(search)
  const visible = inPeriod.filter(
    (e) =>
      (!categoryFilter || e.categoryId === categoryFilter) &&
      (!term || nameKey(`${e.notes ?? ''} ${nameOf(catById.get(e.categoryId))} ${supplierById.get(e.supplierId ?? '') ?? ''}`).includes(term)),
  )
  const total = visible.reduce((s, e) => s + e.amountBaisa, 0)
  const byCategory = totalsBy(inPeriod, (e) => e.categoryId, (e) => e.amountBaisa)
  const periodTotal = byCategory.reduce((s, c) => s + c.total, 0)
  const vatTotal = inPeriod.reduce((s, e) => s + e.vatBaisa, 0)

  return (
    <>
      <PageHeader
        title={t('المصروفات', 'Expenses')}
        actions={
          <>
            <Link to="/expenses/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4">
              <Camera className="size-5" />
              {t('تصوير فاتورة', 'Photograph a receipt')}
            </Link>
            <Link to="/expenses/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 font-medium text-on-brand">
              <Plus className="size-5" />
              {t('مصروف جديد', 'New expense')}
            </Link>
          </>
        }
      />
      {q.error && !data && <FormError message={serverError(q.error)} />}

      <div className="mb-5">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t('إجمالي المصروفات', 'Total expenses')} value={formatOMR(periodTotal)} />
        <Stat label={t('عدد المصروفات', 'Number of expenses')} value={inPeriod.length} />
        <Stat label={t('الضريبة المدفوعة', 'VAT paid')} value={formatOMR(vatTotal)} />
      </div>

      {byCategory.length > 0 && (
        <Card className="mb-5">
          <h2 className="mb-3 font-bold">{t('حسب التصنيف', 'By category')}</h2>
          <ul className="flex flex-col gap-1">
            {byCategory.map(({ key, total: amount }) => {
              const c = catById.get(key)
              const active = categoryFilter === key
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(active ? null : key)}
                    className={`w-full rounded-xl px-3 py-2 text-start transition ${active ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-stone-50'}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: c?.color ?? FALLBACK }} />
                        {nameOf(c)}
                      </span>
                      <span>
                        <span className="num font-bold">{formatOMR(amount)}</span>
                        <span className="num ms-2 text-xs text-muted">{ltr(`${Math.round((amount / periodTotal) * 100)}%`)}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full" style={{ width: `${(amount / byCategory[0].total) * 100}%`, background: c?.color ?? FALLBACK }} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {categoryFilter && <p className="mt-2 text-xs text-muted">{t('اضغط على التصنيف مرة أخرى لإلغاء الفلتر.', 'Tap the category again to clear the filter.')}</p>}
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
          <h2 className="font-bold">
            {t('المصروفات', 'Expenses')} {categoryFilter && `— ${nameOf(catById.get(categoryFilter))}`}
            <span className="num ms-2 text-sm font-normal text-muted">({formatOMR(total)})</span>
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('بحث بالمورد أو الملاحظة…', 'Search supplier or notes…')} className="ps-9" />
          </div>
        </div>
        {data && !visible.length && (
          <EmptyState
            icon={ReceiptText}
            title={t('لا توجد مصروفات في هذه الفترة', 'No expenses in this period')}
            description={t('الإيجار والكهرباء والنقل وغيرها تُسجَّل هنا لتظهر في حساب صافي الربح.', 'Record rent, electricity, transport and more so they count in net profit.')}
          />
        )}
        <ul className="divide-y divide-line border-t border-line">
          {visible.map((e) => {
            const c = catById.get(e.categoryId)
            const sup = e.supplierId ? supplierById.get(e.supplierId) : null
            return (
              <li key={e.id}>
                <Link to={`/expenses/${e.id}`} className="flex w-full items-center gap-3 px-5 py-3 hover:bg-brand-50">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: c?.color ?? FALLBACK }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {nameOf(c)}
                      {sup && <span className="font-normal text-muted"> · {sup}</span>}
                    </div>
                    <div className="text-sm text-muted">
                      <span className="num">{formatDate(e.date)}</span> · {methodLabel(e.method)}
                      {e.notes ? ` · ${e.notes}` : ''}
                    </div>
                  </div>
                  {e.receiptPath && <Paperclip className="size-4 text-muted" aria-label={t('صورة مرفقة', 'Photo attached')} />}
                  <span className="num font-bold">{formatOMR(e.amountBaisa)}</span>
                  <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}
