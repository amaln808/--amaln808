import { Package, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY, type ItemWithStock } from '../../data/inventory'
import { fetchRecipes, PRODUCTION_KEY } from '../../data/production'
import { useQuery } from '../../data/useQuery'
import { useSignedUrl } from '../../data/useSignedUrl'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { useSchedule } from '../tasks/useSchedule'
import { PERMIT_TONE, permitFor, permitLabel } from './permits'
import { ProductFormModal } from './ProductFormModal'

function ProductCard({ p, recipeState, permit }: { p: ItemWithStock; recipeState: 'none' | 'estimate' | 'ok'; permit: ReturnType<typeof permitFor> }) {
  const photo = useSignedUrl('products', p.photoPath)
  return (
    <Link to={`/products/${p.id}`} className="block">
      <Card className="flex h-full gap-4 hover:bg-brand-50">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 text-brand-800">
          {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <Package className="size-8" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{nameOf(p)}</div>
          <div className="mt-1 text-sm text-muted">
            {t(`جاهز للبيع ${formatQty(p.stock.sellableQty)}`, `${formatQty(p.stock.sellableQty)} ready for sale`)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={PERMIT_TONE[permit.state]}>{permitLabel(permit)}</Badge>
            {recipeState === 'none' && <Badge tone="red">{t('بلا وصفة', 'No recipe')}</Badge>}
            {recipeState === 'estimate' && <Badge tone="amber">{t('وصفة تقديرية', 'Estimated recipe')}</Badge>}
          </div>
        </div>
      </Card>
    </Link>
  )
}

export function ProductsPage() {
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const recipes = useQuery(PRODUCTION_KEY + ':recipes', fetchRecipes)
  const schedule = useSchedule()
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const products = (items.data ?? []).filter((i) => i.type === 'finished' && i.active)
  const stopped = (items.data ?? []).filter((i) => i.type === 'finished' && !i.active)

  return (
    <>
      <PageHeader
        title={t('المنتجات', 'Products')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-5" />
            {t('منتج جديد', 'New product')}
          </Button>
        }
      />
      {items.error && !items.data && <FormError message={serverError(items.error)} />}
      {!products.length ? (
        <Card>
          <EmptyState icon={Package} title={items.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد منتجات بعد', 'No products yet')} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((p) => {
            const r = recipes.data?.find((x) => x.productId === p.id)
            return (
              <ProductCard
                key={p.id}
                p={p}
                recipeState={!r || !r.components.length ? 'none' : r.isEstimate ? 'estimate' : 'ok'}
                permit={permitFor(p.id, schedule.data?.agreements ?? [], schedule.todayDate)}
              />
            )
          })}
        </div>
      )}
      {stopped.length > 0 && (
        <details className="mt-5 text-sm text-muted">
          <summary className="min-h-11 cursor-pointer py-2">{t(`منتجات محذوفة من القائمة (${stopped.length})`, `Removed products (${stopped.length})`)}</summary>
          <p className="mb-2">{t('لها سجلات سابقة فبقيت محفوظة. لإعادة منتج: افتحه ← تعديل ← «إعادة تفعيل».', 'They have past records, so they are kept. To bring one back: open it → Edit → «Reactivate».')}</p>
          <ul className="flex flex-col gap-1 ps-4">
            {stopped.map((p) => (
              <li key={p.id}>
                <Link to={`/products/${p.id}`} className="underline">
                  {nameOf(p)}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      {adding && <ProductFormModal onClose={(id) => (setAdding(false), id && navigate(`/products/${id}`))} />}
    </>
  )
}
