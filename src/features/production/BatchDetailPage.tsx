import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, formatDate } from '../../components/format'
import { useConfirm } from '../../components/useConfirm'
import { Button, Card, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import { formatOMR, lineTotal } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { deleteBatch } from '../../services/production'

export function BatchDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const batch = useLiveQuery(() => db.productionBatches.get(id), [id])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (batch === undefined) return null
  if (batch === null) return <p>الدفعة غير موجودة</p>

  const byId = new Map(items?.map((i) => [i.id, i]))
  const product = byId.get(batch.finishedItemId)

  const remove = async () => {
    const ok = await confirm({
      title: 'حذف الدفعة',
      message: 'ستُعاد المواد المستهلكة إلى المخزون وتُخصم العبوات المنتجة منه.\nلا يمكن التراجع عن ذلك.',
      confirmLabel: 'حذف',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteBatch(db, batch.id)
      navigate('/production', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title={`دفعة ${batch.batchNo}`}
        subtitle={
          <>
            <Link to={`/inventory/${batch.finishedItemId}`} className="text-brand-700">{product?.name}</Link>
            {' · '}
            <span className="num">{formatDate(batch.date)}</span>
            {batch.expiryDate && <> · ينتهي <span className="num">{formatDate(batch.expiryDate)}</span></>}
          </>
        }
        back={{ to: '/production', label: ar.nav.production }}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="الكمية المنتجة" value={formatQty(batch.qtyProduced, product?.unit)} />
        <Stat label="تكلفة المواد" value={formatOMR(batch.materialsCostBaisa)} />
        <Stat label="إجمالي التكلفة" value={formatOMR(batch.totalCostBaisa)} />
        <Stat label="تكلفة العبوة" value={formatOMR(Math.round(batch.unitCostBaisa))} />
      </div>

      <Card className="!p-0 mb-5 overflow-hidden">
        <h2 className="px-5 pt-4 pb-2 text-lg font-bold">المواد المستهلكة</h2>
        <table className="w-full text-sm">
          <thead className="text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="px-5 py-2 text-start font-medium">المادة</th>
              <th className="py-2 pe-4 text-start font-medium">الكمية</th>
              <th className="py-2 pe-4 text-start font-medium">تكلفة الوحدة</th>
              <th className="py-2 pe-5 text-start font-medium">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {batch.consumed.map((c) => {
              const m = byId.get(c.itemId)
              return (
                <tr key={c.itemId} className="border-b border-stone-100 last:border-0">
                  <td className="px-5 py-3"><Link to={`/inventory/${c.itemId}`} className="text-brand-700">{m?.name ?? '—'}</Link></td>
                  <td className="py-3 pe-4"><span className="num">{formatQty(c.qty, m?.unit)}</span></td>
                  <td className="py-3 pe-4"><span className="num">{formatOMR(Math.round(c.unitCostBaisa))}</span></td>
                  <td className="py-3 pe-5"><span className="num font-bold">{formatOMR(lineTotal(c.qty, c.unitCostBaisa))}</span></td>
                </tr>
              )
            })}
            {batch.extraCostBaisa > 0 && (
              <tr>
                <td className="px-5 py-3" colSpan={3}>تكاليف مباشرة إضافية</td>
                <td className="py-3 pe-5"><span className="num font-bold">{formatOMR(batch.extraCostBaisa)}</span></td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {batch.notes && <Card className="mb-5 text-sm text-stone-600">{batch.notes}</Card>}

      <Button variant="ghost" className="text-red-700" onClick={remove}>
        <Trash2 className="size-4" /> حذف الدفعة
      </Button>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {dialog}
    </>
  )
}
