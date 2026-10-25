import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { FormError } from '../../components/form'
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemDetail, type Lot } from '../../data/inventory'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { expiryState } from '../../domain/fefo'
import { formatOMR } from '../../domain/money'
import { formatQty, formatSignedQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'
import { DeleteItemButton } from './DeleteItemButton'
import { ItemFormModal } from './ItemFormModal'
import { itemTypeLabel, movementLabel, sourceLabel } from './labels'
import { AddStockModal, AdjustLotModal } from './LotModals'

/** Where a movement came from, as a link when there is a page for it. */
function refLink(m: { refType: string; refId: string | null }) {
  if (!m.refId) return null
  if (m.refType === 'purchase') return `/purchases/${m.refId}`
  if (m.refType === 'batch') return `/production/${m.refId}`
  return null
}

export function ItemPage() {
  const { id = '' } = useParams()
  const q = useQuery(`item:${id}`, () => fetchItemDetail(id))
  const alertDays = useSettingsQuery().data?.expiryAlertDays ?? 30
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [adjusting, setAdjusting] = useState<Lot | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)
  const today = todayIso()

  if (!q.data) {
    return (
      <>
        <PageHeader title={t('الصنف', 'Item')} back={{ to: '/inventory', label: t('المخزون', 'Inventory') }} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }

  const { item, lots, movements } = q.data
  const open = lots.filter((l) => l.qtyRemaining > 0)
  const usable = open.filter((l) => !l.expiryDate || l.expiryDate >= today)
  const expired = open.filter((l) => l.expiryDate && l.expiryDate < today)
  const value = open.reduce((s, l) => s + l.qtyRemaining * l.unitCostBaisa, 0)
  const shownLots = showEmpty ? lots : open

  return (
    <>
      <PageHeader
        title={nameOf(item)}
        subtitle={`${itemTypeLabel(item.type)}${item.active ? '' : ` · ${t('موقوف', 'inactive')}`}`}
        back={{ to: item.type === 'finished' ? '/products' : '/inventory', label: item.type === 'finished' ? t('المنتجات', 'Products') : t('المخزون', 'Inventory') }}
        actions={
          <>
            {item.type !== 'finished' && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                {t('تعديل', 'Edit')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              {t('إضافة رصيد', 'Add stock')}
            </Button>
            {item.active && (
              <DeleteItemButton id={item.id} name={nameOf(item)} backTo={item.type === 'finished' ? '/products' : '/inventory'} onError={setError} />
            )}
          </>
        }
      />

      <div className="flex flex-col gap-5">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('المتاح للاستخدام', 'Usable')} value={formatQty(usable.reduce((s, l) => s + l.qtyRemaining, 0), item.unit)} />
          <Stat label={t('القيمة', 'Value')} value={formatOMR(Math.round(value))} />
          <Stat label={t('منتهي الصلاحية', 'Expired')} value={formatQty(expired.reduce((s, l) => s + l.qtyRemaining, 0), item.unit)} tone={expired.length ? 'red' : undefined} />
          <Stat label={t('الحد الأدنى', 'Minimum')} value={formatQty(item.minQty, item.unit)} />
        </div>

        <Card className="p-0">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-lg font-bold">{t('الدفعات', 'Lots')}</h2>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="size-4" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
              {t('إظهار الدفعات المنتهية الكمية', 'Show used-up lots')}
            </label>
          </div>
          <p className="px-5 pb-2 text-sm text-muted">{t('يُصرف تلقائياً من الأقرب انتهاءً أولاً.', 'Stock is used from the nearest expiry first.')}</p>
          {!shownLots.length ? (
            <p className="px-5 pb-5 text-muted">{t('لا توجد دفعات.', 'No lots.')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {shownLots.map((l) => {
                const state = expiryState(l.expiryDate, today, alertDays)
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-40 flex-1">
                      <div className="font-medium" dir="auto">
                        {l.lotCode ?? t('بدون رقم', 'No lot no.')}
                      </div>
                      <div className="text-sm text-muted">
                        {sourceLabel(l.sourceType)} · {formatDate(l.receivedDate)}
                      </div>
                    </div>
                    <div className="text-sm">
                      {l.expiryDate ? (
                        <Badge tone={state === 'expired' ? 'red' : state === 'soon' ? 'amber' : 'stone'}>
                          {state === 'expired' ? t('انتهت', 'Expired') : t('تنتهي', 'Expires')} {formatDate(l.expiryDate)}
                        </Badge>
                      ) : (
                        <span className="text-muted">{t('بلا انتهاء', 'No expiry')}</span>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="num font-bold">
                        {formatQty(l.qtyRemaining)} / {formatQty(l.qtyIn, item.unit)}
                      </div>
                      <div className="num text-sm text-muted">
                        {formatOMR(Math.round(l.unitCostBaisa))} {t('للوحدة', 'each')}
                      </div>
                    </div>
                    {l.qtyRemaining > 0 && (
                      <Button variant={state === 'expired' ? 'primary' : 'secondary'} onClick={() => setAdjusting(l)}>
                        {state === 'expired' ? t('تسجيل تالف', 'Record waste') : t('تعديل', 'Adjust')}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <h2 className="px-5 pt-4 pb-2 text-lg font-bold">{t('الحركات', 'Movements')}</h2>
          {!movements.length ? (
            <p className="px-5 pb-5 text-muted">{t('لا توجد حركات.', 'No movements.')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {movements.map((m) => {
                const link = refLink(m)
                const lot = lots.find((l) => l.id === m.lotId)
                const body = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div>{movementLabel(m.type)}</div>
                      <div className="text-sm text-muted">
                        {formatDate(m.date)}
                        {lot?.lotCode ? ` · ${lot.lotCode}` : ''}
                        {m.notes ? ` · ${m.notes}` : ''}
                      </div>
                    </div>
                    <span className={`num font-bold ${m.qty < 0 ? 'text-red-700' : 'text-palm'}`}>{formatSignedQty(m.qty, item.unit)}</span>
                  </>
                )
                return (
                  <li key={m.id}>
                    {link ? (
                      <Link to={link} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-5 py-3">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {editing && <ItemFormModal item={item} onClose={() => setEditing(false)} />}
      {adding && <AddStockModal item={item} onClose={() => setAdding(false)} />}
      {adjusting && <AdjustLotModal item={item} lot={adjusting} onClose={() => setAdjusting(null)} />}
    </>
  )
}
