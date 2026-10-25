import { ChevronLeft, Factory, PackageCheck, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Badge, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { expiryState } from '../../domain/fefo'
import { formatOMR } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'
import { useStock } from './useStock'

/**
 * Finished products ready for sale, kept apart from raw materials and packaging:
 * how many units of each product, and which production batches they sit in.
 */
export function ReadyStockPage() {
  const { items, lots, alertDays, today } = useStock()
  const products = (items.data ?? []).filter((i) => i.active && i.type === 'finished')
  const productIds = new Set(products.map((p) => p.id))
  const open = (lots.data ?? [])
    .filter((l) => productIds.has(l.itemId))
    .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999'))
  const usable = (l: (typeof open)[number]) => !l.expiryDate || l.expiryDate >= today
  const units = products.reduce((s, p) => s + p.stock.usableQty, 0)
  const value = open.filter(usable).reduce((s, l) => s + l.qtyRemaining * l.unitCostBaisa, 0)
  const expiredUnits = open.filter((l) => !usable(l)).reduce((s, l) => s + l.qtyRemaining, 0)

  return (
    <>
      <PageHeader
        title={t('المخزون الجاهز للبيع', 'Ready for sale')}
        subtitle={t('المنتجات النهائية فقط — المواد الخام والتغليف في «مخزون المواد».', 'Finished products only — raw materials and packaging are in «Materials stock».')}
        actions={
          <>
            <Link to="/production/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4">
              <Factory className="size-5" />
              {t('دفعة إنتاج', 'New batch')}
            </Link>
            <Link to="/invoices/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 font-medium text-on-brand">
              <Plus className="size-5" />
              {t('فاتورة', 'Invoice')}
            </Link>
          </>
        }
      />
      {items.error && !items.data && <FormError message={serverError(items.error)} />}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t('عبوات جاهزة', 'Units ready')} value={formatQty(units)} />
        <Stat label={t('قيمتها بالتكلفة', 'Value at cost')} value={formatOMR(Math.round(value))} />
        <Stat label={t('منتهية الصلاحية', 'Expired')} value={formatQty(expiredUnits)} tone={expiredUnits > 0 ? 'red' : undefined} />
      </div>

      {!products.length ? (
        <Card>
          <EmptyState
            icon={PackageCheck}
            title={items.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد منتجات بعد', 'No products yet')}
            description={t('أضيفي المنتجات من صفحة المنتجات، ثم سجّلي دفعة إنتاج.', 'Add products on the Products page, then record a production batch.')}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {products.map((p) => {
            const mine = open.filter((l) => l.itemId === p.id)
            return (
              <Card key={p.id} className="p-0">
                <Link to={`/products/${p.id}`} className="flex items-center gap-4 px-5 pt-4 pb-3 hover:text-brand-800">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold">{nameOf(p)}</h2>
                    <div className="text-sm text-muted">
                      {mine.length ? t(`${mine.length} دفعة في المخزون`, `${mine.length} batch(es) in stock`) : t('لا توجد كمية', 'None in stock')}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="num text-xl font-bold">{formatQty(p.stock.usableQty)}</div>
                    <div className="text-xs text-muted">{t('عبوة جاهزة', 'units ready')}</div>
                  </div>
                  <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                </Link>
                {mine.length > 0 && (
                  <ul className="divide-y divide-line border-t border-line">
                    {mine.map((l) => {
                      const exp = expiryState(l.expiryDate, today, alertDays)
                      return (
                        <li key={l.id}>
                          <Link to={l.sourceId ? `/production/${l.sourceId}` : `/products/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-brand-50">
                            <span className="font-medium" dir="ltr">{l.lotCode ?? '—'}</span>
                            <span className="text-sm text-muted">{t(`أُنتجت ${formatDate(l.receivedDate)}`, `made ${formatDate(l.receivedDate)}`)}</span>
                            {l.expiryDate && (
                              <span className="text-sm">
                                {exp === 'expired' ? (
                                  <Badge tone="red">{t(`منتهية ${formatDate(l.expiryDate)}`, `Expired ${formatDate(l.expiryDate)}`)}</Badge>
                                ) : exp === 'soon' ? (
                                  <Badge tone="amber">{t(`تنتهي ${formatDate(l.expiryDate)}`, `Expires ${formatDate(l.expiryDate)}`)}</Badge>
                                ) : (
                                  <span className="text-muted">{t(`تنتهي ${formatDate(l.expiryDate)}`, `expires ${formatDate(l.expiryDate)}`)}</span>
                                )}
                              </span>
                            )}
                            <span className="num ms-auto font-bold">{formatQty(l.qtyRemaining)}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
