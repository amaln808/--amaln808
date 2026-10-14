import { useLiveQuery } from 'dexie-react-hooks'
import { Card, PageHeader } from '../../components/ui'
import { db } from '../../db/db'
import { ar } from '../../i18n/ar'

/** Phase 0: shows the seeded categories. Expense entry arrives in phase 4. */
export function ExpensesPage() {
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), [])
  return (
    <>
      <PageHeader title={ar.nav.expenses} />
      <Card>
        <h2 className="mb-1 font-bold">التصنيفات</h2>
        <p className="mb-4 text-sm text-stone-500">{ar.common.phase(4)}</p>
        <div className="flex flex-wrap gap-2">
          {categories?.map((c) => (
            <span
              key={c.id}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-200 px-4"
            >
              <span className="size-2.5 rounded-full" style={{ background: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
      </Card>
    </>
  )
}
