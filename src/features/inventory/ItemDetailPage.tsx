import { useLiveQuery } from 'dexie-react-hooks'
import { Minus, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, formatDate } from '../../components/format'
import { useConfirm } from '../../components/useConfirm'
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import type { StockMovement } from '../../db/types'
import { stockValue } from '../../domain/inventory'
import { formatOMR } from '../../domain/money'
import { formatQty, formatSignedQty } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { deleteItem, updateItem } from '../../services/items'
import { AdjustModal } from './AdjustModal'
import { StockBadge } from './InventoryPage'
import { ItemFormModal } from './ItemFormModal'

function refLink(m: StockMovement): string | null {
  if (m.refType === 'purchase' && m.refId) return `/purchases/${m.refId}`
  if (m.refType === 'batch' && m.refId) return `/production/${m.refId}`
  return null
}

export function ItemDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const item = useLiveQuery(() => db.items.get(id), [id])
  const movements = useLiveQuery(
    async () =>
      (await db.stockMovements.where('itemId').equals(id).toArray()).sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      ),
    [id],
  )
  const [editing, setEditing] = useState(false)
  const [adjustMode, setAdjustMode] = useState<'increase' | 'decrease' | 'waste' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (item === undefined) return null
  if (item === null) return <p>الصنف غير موجود</p>

  const remove = async () => {
    if (!(await confirm({ title: 'حذف الصنف', message: `حذف «${item.name}» نهائياً؟`, confirmLabel: 'حذف', danger: true }))) return
    try {
      await deleteItem(db, item.id)
      navigate('/inventory')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const toggleActive = () => updateItem(db, item.id, { ...item, active: !item.active })

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={
          <span className="flex items-center gap-2">
            {ar.itemTypes[item.type]} <StockBadge item={item} />
          </span>
        }
        back={{ to: '/inventory', label: ar.nav.inventory }}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> تعديل
            </Button>
            <Button variant="secondary" onClick={() => setAdjustMode('increase')}>
              <Plus className="size-4" /> تسوية
            </Button>
            <Button variant="secondary" onClick={() => setAdjustMode('waste')}>
              <Minus className="size-4" /> تالف
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="الرصيد الحالي" value={formatQty(item.qtyOnHand, item.unit)} tone={item.qtyOnHand <= item.minQty ? 'red' : undefined} />
        <Stat label="الحد الأدنى" value={formatQty(item.minQty, item.unit)} />
        <Stat label="متوسط تكلفة الوحدة" value={formatOMR(Math.round(item.avgCostBaisa))} />
        <Stat label="قيمة الرصيد" value={formatOMR(stockValue(item))} />
      </div>
      {item.type === 'finished' && (
        <Card className="mb-5">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <span>
              سعر البيع: <b className="num">{item.salePriceBaisa != null ? formatOMR(item.salePriceBaisa) : '—'}</b>
            </span>
            <span>
              وزن العبوة: <b className="num">{item.packageSizeG ? `≈${item.packageSizeG} جم` : '—'}</b>
            </span>
          </div>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <h2 className="px-5 pt-4 pb-2 text-lg font-bold">حركات المخزون</h2>
        {!movements?.length && <p className="px-5 pb-5 text-stone-500">لا توجد حركات بعد.</p>}
        <ul>
          {movements?.map((m) => {
            const link = refLink(m)
            const body = (
              <div className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <div className="font-medium">{ar.movementTypes[m.type]}</div>
                  <div className="text-sm text-stone-500">
                    <span className="num">{formatDate(m.date)}</span>
                    {m.notes && ` · ${m.notes}`}
                  </div>
                </div>
                <div className="text-end">
                  <div className={`num font-bold ${m.qty > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatSignedQty(m.qty, item.unit)}
                  </div>
                  <div className="num text-xs text-stone-500">{formatOMR(Math.round(m.unitCostBaisa))} / وحدة</div>
                </div>
              </div>
            )
            return (
              <li key={m.id} className="border-t border-stone-100">
                {link ? <Link to={link} className="block hover:bg-stone-50">{body}</Link> : body}
              </li>
            )
          })}
        </ul>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={toggleActive}>
          <Power className="size-4" /> {item.active ? 'إيقاف الصنف' : 'إعادة تفعيل الصنف'}
        </Button>
        <Button variant="ghost" className="text-red-700" onClick={remove}>
          <Trash2 className="size-4" /> حذف
        </Button>
        {!item.active && <Badge>الصنف الموقوف لا يظهر في قوائم الاختيار</Badge>}
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <ItemFormModal open={editing} onClose={() => setEditing(false)} item={item} />
      {adjustMode && (
        <AdjustModal open onClose={() => setAdjustMode(null)} item={item} initialMode={adjustMode} />
      )}
      {dialog}
    </>
  )
}
