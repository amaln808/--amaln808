import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { deleteBatch, fetchBatchDetail } from '../../data/production'
import { useQuery } from '../../data/useQuery'
import { formatOMR } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { QC_TONE, qcLabel, sourceLabel } from '../inventory/labels'
import { formatDate } from '../tasks/labels'

export function BatchPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const q = useQuery(`batch:${id}`, () => fetchBatchDetail(id))
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const byId = new Map((items.data ?? []).map((i) => [i.id, i]))
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (!q.data) {
    return (
      <>
        <PageHeader title={t('دفعة إنتاج', 'Batch')} back={{ to: '/production', label: t('التصنيع', 'Production') }} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }
  const { batch, outputLot, consumption } = q.data
  const product = byId.get(batch.productId)

  const remove = async () => {
    const ok = await confirm({
      title: t(`حذف الدفعة ${batch.batchNo}`, `Delete batch ${batch.batchNo}`),
      message: t('تعود المواد المستهلكة إلى دفعاتها، ويُحذف المنتج من المخزون. يُرفض إن بيع منه شيء.', 'Materials go back to their lots and the product leaves stock. Refused if any was sold.'),
      confirmLabel: t('حذف', 'Delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteBatch(batch.id)
      navigate('/production', { replace: true })
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <>
      <PageHeader
        title={t(`دفعة ${batch.batchNo}`, `Batch ${batch.batchNo}`)}
        subtitle={
          <>
            <Link to={`/products/${batch.productId}`} className="underline">{nameOf(product)}</Link> · {formatDate(batch.productionDate)}
          </>
        }
        back={{ to: '/production', label: t('التصنيع', 'Production') }}
        actions={
          <Button variant="ghost" className="text-red-700" onClick={remove}>
            <Trash2 className="size-4" />
            {t('حذف', 'Delete')}
          </Button>
        }
      />
      <div className="flex flex-col gap-5">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('الكمية المنتجة', 'Produced')} value={formatQty(batch.qtyProduced)} />
          <Stat label={t('تكلفة العبوة', 'Cost per unit')} value={formatOMR(Math.round(batch.unitCostBaisa))} />
          <Stat label={t('التكلفة الكلية', 'Total cost')} value={formatOMR(batch.totalCostBaisa)} />
          <Stat label={t('المتبقي في المخزون', 'Left in stock')} value={formatQty(outputLot?.qtyRemaining ?? 0)} />
        </div>
        <Card className="flex flex-wrap items-center gap-3">
          {outputLot && <Badge tone={QC_TONE[outputLot.qcStatus]}>{qcLabel(outputLot.qcStatus)}</Badge>}
          {batch.expiryDate && <span>{t(`تنتهي ${formatDate(batch.expiryDate)}`, `Expires ${formatDate(batch.expiryDate)}`)}</span>}
          <span className="text-sm text-muted">
            {t(`المواد ${formatOMR(batch.materialsCostBaisa)} + إضافية ${formatOMR(batch.extraCostBaisa)}`, `Materials ${formatOMR(batch.materialsCostBaisa)} + extra ${formatOMR(batch.extraCostBaisa)}`)}
          </span>
        </Card>
        <Card className="p-0">
          <h2 className="px-5 pt-4 text-lg font-bold">{t('المواد المستهلكة ودفعاتها', 'Materials used and their lots')}</h2>
          <p className="px-5 pb-2 text-sm text-muted">{t('للتتبع: من أي دفعة مورد جاءت كل مادة.', 'Traceability: which supplier lot each material came from.')}</p>
          <ul className="divide-y divide-line">
            {consumption.map((c, i) => {
              const item = byId.get(c.itemId)
              return (
                <li key={i}>
                  <Link to={`/inventory/${c.itemId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-brand-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{nameOf(item)}</div>
                      <div className="text-sm text-muted">
                        {t('دفعة', 'Lot')} <span dir="ltr">{c.lot.lotCode ?? '—'}</span> · {sourceLabel(c.lot.sourceType)}
                        {c.lot.expiryDate ? ` · ${t('تنتهي', 'expires')} ${formatDate(c.lot.expiryDate)}` : ''}
                      </div>
                    </div>
                    <span className="num">{formatQty(c.qty, item?.unit)}</span>
                    <span className="num font-bold">{formatOMR(Math.round(c.qty * c.unitCostBaisa))}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
        {batch.notes && (
          <Card>
            <p className="whitespace-pre-line">{batch.notes}</p>
          </Card>
        )}
      </div>
      {dialog}
    </>
  )
}
