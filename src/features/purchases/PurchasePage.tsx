import { HandCoins, Paperclip, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Button, Card, PageHeader, Stat } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { signedUrl } from '../../data/files'
import { deletePurchase, fetchItemsWithStock, fetchPurchaseDetail, fetchSuppliers, INVENTORY_KEY, SUPPLIERS_KEY } from '../../data/inventory'
import { useQuery } from '../../data/useQuery'
import { formatOMR, lineTotal } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { methodLabel } from '../inventory/labels'
import { PaymentModal } from '../suppliers/PaymentModal'
import { formatDate } from '../tasks/labels'

export function PurchasePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const q = useQuery(`purchase:${id}`, () => fetchPurchaseDetail(id))
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const suppliers = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (!q.data) {
    return (
      <>
        <PageHeader title={t('فاتورة شراء', 'Purchase')} back={{ to: '/suppliers', label: t('الموردون', 'Suppliers') }} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }
  const { purchase, lines, payments } = q.data
  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]))
  const supplier = suppliers.data?.find((s) => s.id === purchase.supplierId)
  const paid = payments.reduce((s, p) => s + p.amountBaisa, 0)

  const remove = async () => {
    const ok = await confirm({
      title: t('حذف فاتورة الشراء', 'Delete purchase'),
      message: t('ستُحذف الفاتورة ودفعاتها، وتُزال كمياتها من المخزون. يُرفض الحذف إن استُخدم شيء منها.', 'The purchase, its payments and its stock will be removed. Refused if any of it was used.'),
      confirmLabel: t('حذف', 'Delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deletePurchase(purchase.id)
      navigate(`/suppliers/${purchase.supplierId}`, { replace: true })
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <>
      <PageHeader
        title={t(`فاتورة شراء ${purchase.supplierInvoiceNo ?? ''}`, `Purchase ${purchase.supplierInvoiceNo ?? ''}`)}
        subtitle={
          <>
            {supplier && <Link to={`/suppliers/${supplier.id}`} className="underline">{supplier.name}</Link>} · {formatDate(purchase.date)}
          </>
        }
        back={{ to: `/suppliers/${purchase.supplierId}`, label: supplier?.name ?? t('المورد', 'Supplier') }}
        actions={
          <>
            {purchase.attachmentPath && (
              <Button variant="secondary" onClick={async () => window.open(await signedUrl('receipts', purchase.attachmentPath!), '_blank')}>
                <Paperclip className="size-4" />
                {t('صورة الفاتورة', 'Invoice photo')}
              </Button>
            )}
            <Button variant="ghost" className="text-red-700" onClick={remove}>
              <Trash2 className="size-4" />
              {t('حذف', 'Delete')}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('الإجمالي', 'Total')} value={formatOMR(purchase.totalBaisa)} />
          <Stat label={t('المدفوع', 'Paid')} value={formatOMR(paid)} />
          <Stat label={t('المتبقي', 'Remaining')} value={formatOMR(purchase.totalBaisa - paid)} tone={purchase.totalBaisa - paid > 0 ? 'red' : 'green'} />
        </div>
        <FormError message={error} />
        <Card className="p-0">
          <h2 className="px-5 pt-4 pb-2 text-lg font-bold">{t('البنود', 'Lines')}</h2>
          <ul className="divide-y divide-line">
            {lines.map((l) => {
              const item = itemById.get(l.itemId)
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/inventory/${l.itemId}`} className="font-medium underline-offset-4 hover:underline">
                      {nameOf(item)}
                    </Link>
                    <div className="text-sm text-muted">
                      {l.supplierLotCode ? `${t('دفعة', 'Lot')} ${l.supplierLotCode}` : ''}
                      {l.expiryDate ? ` · ${t('تنتهي', 'expires')} ${formatDate(l.expiryDate)}` : ''}
                      {l.vatRate ? ` · ${t('ضريبة', 'VAT')} ${l.vatRate}%` : ''}
                    </div>
                  </div>
                  <span className="num text-sm text-muted">
                    {formatQty(l.qty, item?.unit)} × {formatOMR(l.unitCostBaisa)}
                  </span>
                  <span className="num font-bold">{formatOMR(lineTotal(l.qty, l.unitCostBaisa))}</span>
                </li>
              )
            })}
          </ul>
          {purchase.vatBaisa > 0 && (
            <p className="border-t border-line px-5 py-3 text-sm text-muted">
              {t(`الضريبة المدفوعة ${formatOMR(purchase.vatBaisa)} أُضيفت إلى تكلفة المواد لأن المنشأة غير مسجلة ضريبياً.`, `VAT paid ${formatOMR(purchase.vatBaisa)} was added to the material cost (not VAT-registered).`)}
            </p>
          )}
        </Card>
        <Card className="p-0">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-lg font-bold">{t('الدفعات', 'Payments')}</h2>
            {purchase.totalBaisa - paid > 0 && (
              <Button variant="secondary" onClick={() => setPaying(true)}>
                <HandCoins className="size-4" />
                {t('تسجيل دفعة', 'Record payment')}
              </Button>
            )}
          </div>
          {!payments.length ? (
            <p className="px-5 pb-5 text-muted">{t('لم تُدفع بعد.', 'Not paid yet.')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="num w-24 text-sm text-muted">{formatDate(p.date)}</span>
                  <span className="flex-1">{methodLabel(p.method)}</span>
                  <span className="num font-bold text-palm">{formatOMR(p.amountBaisa)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {purchase.notes && (
          <Card>
            <p className="whitespace-pre-line">{purchase.notes}</p>
          </Card>
        )}
      </div>
      {paying && (
        <PaymentModal supplierId={purchase.supplierId} purchaseId={purchase.id} dueBaisa={purchase.totalBaisa - paid} onClose={() => setPaying(false)} />
      )}
      {dialog}
    </>
  )
}
