import { Factory, Package, Pencil, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemDetail, fetchItemsWithStock, fetchOpenLots, INVENTORY_KEY } from '../../data/inventory'
import { fetchRecipes, PRODUCTION_KEY } from '../../data/production'
import { useQuery } from '../../data/useQuery'
import { useSignedUrl } from '../../data/useSignedUrl'
import { formatOMR } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'
import { useSchedule } from '../tasks/useSchedule'
import { PERMIT_TONE, permitFor, permitLabel } from './permits'
import { ProductFormModal } from './ProductFormModal'
import { RecipeEditor } from './RecipeEditor'

export function ProductPage() {
  const { id = '' } = useParams()
  const q = useQuery(`item:${id}`, () => fetchItemDetail(id))
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const lots = useQuery(`${INVENTORY_KEY}:lots`, fetchOpenLots)
  const recipes = useQuery(PRODUCTION_KEY + ':recipes', fetchRecipes)
  const schedule = useSchedule()
  const photo = useSignedUrl('products', q.data?.item.photoPath)
  const [editing, setEditing] = useState(false)

  if (!q.data) {
    return (
      <>
        <PageHeader title={t('المنتج', 'Product')} back={{ to: '/products', label: t('المنتجات', 'Products') }} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }
  const { item, lots: productLots } = q.data
  const permit = permitFor(item.id, schedule.data?.agreements ?? [], schedule.todayDate)
  const open = productLots.filter((l) => l.qtyRemaining > 0)
  const sellable = open.filter((l) => (!l.expiryDate || l.expiryDate >= schedule.todayDate))
  const materials = (items.data ?? []).filter((i) => i.active && i.type !== 'finished')

  return (
    <>
      <PageHeader
        title={nameOf(item)}
        back={{ to: '/products', label: t('المنتجات', 'Products') }}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              {t('تعديل', 'Edit')}
            </Button>
            <Link to={`/production/new?product=${item.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 font-medium text-on-brand">
              <Factory className="size-5" />
              {t('دفعة إنتاج', 'Production batch')}
            </Link>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-5 sm:flex-row">
          <div className="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 text-brand-800">
            {photo ? <img src={photo} alt={nameOf(item)} className="size-full object-cover" /> : <Package className="size-12" />}
          </div>
          <div className="flex flex-1 flex-col gap-3">
            {item.description && <p className="leading-relaxed">{item.description}</p>}
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {item.weightG && (
                <div>
                  <dt className="inline text-muted">{t('الوزن: ', 'Weight: ')}</dt>
                  <dd className="num inline">{formatQty(item.weightG)} {t('جم', 'g')}</dd>
                </div>
              )}
              {item.shelfLifeDays && (
                <div>
                  <dt className="inline text-muted">{t('الصلاحية: ', 'Shelf life: ')}</dt>
                  <dd className="num inline">{t(`${item.shelfLifeDays} يوماً`, `${item.shelfLifeDays} days`)}</dd>
                </div>
              )}
            </dl>
            <Link to="/agreements" className="inline-flex min-h-11 items-center gap-2 self-start">
              <ScrollText className="size-4" />
              <Badge tone={PERMIT_TONE[permit.state]}>{permitLabel(permit)}</Badge>
              {permit.permit && <span className="text-sm text-muted">{t(`حتى ${formatDate(permit.permit.endDate)}`, `until ${formatDate(permit.permit.endDate)}`)}</span>}
            </Link>
            {permit.state === 'missing' && (
              <p className="text-sm text-muted">{t('يُضاف التصريح من «الاتفاقيات والتصاريح»؛ لا يمكن بيع المنتج بدونه.', 'Add the permit in Agreements & permits; the product cannot be sold without it.')}</p>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label={t('في المخزون', 'In stock')} value={formatQty(open.reduce((s, l) => s + l.qtyRemaining, 0))} />
          <Stat label={t('قابل للبيع الآن', 'Sellable now')} value={formatQty(sellable.reduce((s, l) => s + l.qtyRemaining, 0))} tone={sellable.length ? 'green' : undefined} />
          <Stat label={t('قيمة المخزون', 'Stock value')} value={formatOMR(Math.round(open.reduce((s, l) => s + l.qtyRemaining * l.unitCostBaisa, 0)))} />
        </div>

        <RecipeEditor
          productId={item.id}
          recipe={recipes.data?.find((r) => r.productId === item.id)}
          materials={materials}
          lots={lots.data ?? []}
          today={schedule.todayDate}
        />

        <Card className="p-0">
          <h2 className="px-5 pt-4 pb-2 text-lg font-bold">{t('دفعات المنتج في المخزون', 'Batches in stock')}</h2>
          {!open.length ? (
            <p className="px-5 pb-5 text-muted">{t('لا توجد كمية حالياً.', 'None in stock.')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {open.map((l) => (
                <li key={l.id}>
                  <Link to={l.sourceId ? `/production/${l.sourceId}` : '#'} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-brand-50">
                    <span className="font-medium" dir="ltr">{l.lotCode}</span>
                    <span className="text-sm text-muted">{l.expiryDate ? t(`تنتهي ${formatDate(l.expiryDate)}`, `expires ${formatDate(l.expiryDate)}`) : ''}</span>
                    <span className="num ms-auto font-bold">{formatQty(l.qtyRemaining)}</span>
                    <span className="num text-sm text-muted">{formatOMR(Math.round(l.unitCostBaisa))} {t('للعبوة', 'each')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editing && <ProductFormModal product={item} onClose={() => setEditing(false)} />}
    </>
  )
}
