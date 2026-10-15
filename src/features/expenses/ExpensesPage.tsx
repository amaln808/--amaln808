import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Plus, ReceiptText, Search, Tags } from 'lucide-react'
import { useState } from 'react'
import { initialPeriod, PeriodFilter, resolvePeriod } from '../../components/PeriodFilter'
import { TextInput } from '../../components/form'
import { formatDate } from '../../components/format'
import { Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import type { Expense } from '../../db/types'
import { formatOMR, ltr } from '../../domain/money'
import { inRange, totalsBy } from '../../domain/periods'
import { ar } from '../../i18n/ar'
import { CategoriesModal } from './CategoriesModal'
import { ExpenseFormModal } from './ExpenseFormModal'

export function ExpensesPage() {
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), []) ?? []
  const expenses = useLiveQuery(
    async () => (await db.expenses.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [],
  )
  const [period, setPeriod] = useState(initialPeriod())
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [managing, setManaging] = useState(false)

  const catById = new Map(categories.map((c) => [c.id, c]))
  const range = resolvePeriod(period)
  const inPeriod = expenses?.filter((e) => inRange(e.date, range)) ?? []
  const q = search.trim()
  const visible = inPeriod.filter(
    (e) =>
      (!categoryFilter || e.categoryId === categoryFilter) &&
      (!q || e.description?.includes(q) || catById.get(e.categoryId)?.name.includes(q)),
  )
  const total = visible.reduce((s, e) => s + e.amountBaisa, 0)
  const byCategory = totalsBy(inPeriod, (e) => e.categoryId, (e) => e.amountBaisa)
  const periodTotal = byCategory.reduce((s, c) => s + c.total, 0)
  const salaries = categories.find((c) => c.name === 'رواتب')

  return (
    <>
      <PageHeader
        title={ar.nav.expenses}
        actions={
          <>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-5" /> مصروف جديد
            </Button>
            <Button variant="secondary" onClick={() => setManaging(true)}>
              <Tags className="size-5" /> التصنيفات
            </Button>
          </>
        }
      />

      <div className="mb-5">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="إجمالي المصروفات" value={formatOMR(periodTotal)} />
        <Stat label="عدد المصروفات" value={inPeriod.length} />
        <Stat label="الرواتب" value={formatOMR(byCategory.find((c) => c.key === salaries?.id)?.total ?? 0)} />
      </div>

      {byCategory.length > 0 && (
        <Card className="mb-5">
          <h2 className="mb-3 font-bold">حسب التصنيف</h2>
          <ul className="flex flex-col gap-1">
            {byCategory.map(({ key, total: t }) => {
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
                        <span className="size-2.5 rounded-full" style={{ background: c?.color ?? '#a8a29e' }} />
                        {c?.name ?? '—'}
                      </span>
                      <span>
                        <span className="num font-bold">{formatOMR(t)}</span>
                        <span className="num ms-2 text-xs text-stone-500">{ltr(`${Math.round((t / periodTotal) * 100)}%`)}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full" style={{ width: `${(t / byCategory[0].total) * 100}%`, background: c?.color ?? '#a8a29e' }} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {categoryFilter && <p className="mt-2 text-xs text-stone-500">اضغط على التصنيف مرة أخرى لإلغاء الفلتر.</p>}
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="font-bold">
            المصروفات {categoryFilter && `— ${catById.get(categoryFilter)?.name}`}
            <span className="num ms-2 text-sm font-normal text-stone-500">({formatOMR(total)})</span>
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-stone-400" />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في الوصف…" className="ps-9" />
          </div>
        </div>
        {expenses && !visible.length && (
          <EmptyState icon={ReceiptText} title="لا توجد مصروفات في هذه الفترة" description="سجّل الإيجار والكهرباء والرواتب وغيرها لتظهر في حساب صافي الربح." />
        )}
        <ul>
          {visible.map((e) => {
            const c = catById.get(e.categoryId)
            return (
              <li key={e.id} className="border-t border-stone-100">
                <button onClick={() => setEditing(e)} className="flex w-full items-center gap-3 px-5 py-3 text-start hover:bg-stone-50">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: c?.color ?? '#a8a29e' }} />
                  <div className="flex-1">
                    <div className="font-medium">{c?.name ?? '—'}{e.description && <span className="font-normal text-stone-500"> · {e.description}</span>}</div>
                    <div className="text-sm text-stone-500">
                      <span className="num">{formatDate(e.date)}</span> · {ar.paymentMethods[e.method]}
                    </div>
                  </div>
                  <span className="num font-bold">{formatOMR(e.amountBaisa)}</span>
                  <ChevronLeft className="size-5 text-stone-400" />
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      <ExpenseFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        expense={editing && editing !== 'new' ? editing : undefined}
        categories={categories}
      />
      <CategoriesModal open={managing} onClose={() => setManaging(false)} categories={categories} />
    </>
  )
}
