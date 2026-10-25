import { Calculator, ChevronLeft, Factory, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { fetchBatches, PRODUCTION_KEY } from '../../data/production'
import { useQuery } from '../../data/useQuery'
import { formatOMR } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'

export function ProductionPage() {
  const batches = useQuery(PRODUCTION_KEY, fetchBatches)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const byId = new Map((items.data ?? []).map((i) => [i.id, i]))
  const list = batches.data ?? []

  return (
    <>
      <PageHeader
        title={t('التصنيع', 'Production')}
        actions={
          <>
            <Link to="/production/calculator" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4">
              <Calculator className="size-5" />
              {t('حاسبة المواد', 'Materials calculator')}
            </Link>
            <Link to="/production/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 font-medium text-on-brand">
              <Plus className="size-5" />
              {t('دفعة إنتاج', 'New batch')}
            </Link>
          </>
        }
      />
      {batches.error && !batches.data && <FormError message={serverError(batches.error)} />}
      <Card className="p-0">
        {!list.length ? (
          <EmptyState icon={Factory} title={batches.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد دفعات إنتاج بعد', 'No batches yet')} />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((b) => (
              <li key={b.id}>
                <Link to={`/production/${b.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-brand-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold" dir="ltr">{b.batchNo}</span>
                      <span>{nameOf(byId.get(b.productId))}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                      <span>{formatDate(b.productionDate)}</span>
                      {b.expiryDate && <span>· {t(`تنتهي ${formatDate(b.expiryDate)}`, `expires ${formatDate(b.expiryDate)}`)}</span>}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="num font-bold">{formatQty(b.qtyProduced)} {t('عبوة', 'units')}</div>
                    <div className="num text-sm text-muted">{formatOMR(Math.round(b.unitCostBaisa))} {t('للعبوة', 'each')}</div>
                  </div>
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
