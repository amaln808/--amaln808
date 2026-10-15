import { nameOf, t } from '../../i18n/index'
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
import { deletePurchase } from '../../services/purchases'

export function PurchaseDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const purchase = useLiveQuery(() => db.purchases.get(id), [id])
  const supplier = useLiveQuery(async () => (purchase ? db.suppliers.get(purchase.supplierId) : undefined), [purchase])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const payments = useLiveQuery(() => db.supplierPayments.where('purchaseId').equals(id).toArray(), [id])
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (purchase === undefined) return null
  if (purchase === null) return <p>{t("فاتورة الشراء غير موجودة", "Purchase invoice not found")}</p>

  const itemById = new Map(items?.map((i) => [i.id, i]))
  const paid = payments?.reduce((s, p) => s + p.amountBaisa, 0) ?? 0

  const remove = async () => {
    const msg = [
      t("سيتم حذف الفاتورة وخصم كمياتها من المخزون.", "The invoice will be deleted and its quantities removed from stock."),
      payments?.length ? t(`وسيتم حذف ${payments.length} دفعة مرتبطة بها.`, `${payments.length} linked payment(s) will also be deleted.`) : '',
      t("لا يمكن التراجع عن ذلك.", "This cannot be undone."),
    ]
      .filter(Boolean)
      .join('\n')
    if (!(await confirm({ title: t("حذف فاتورة الشراء", "Delete purchase invoice"), message: msg, confirmLabel: t("حذف", "Delete"), danger: true }))) return
    try {
      await deletePurchase(db, purchase.id)
      navigate(`/suppliers/${purchase.supplierId}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title={t(`فاتورة شراء${purchase.supplierInvoiceNo ? ` #${purchase.supplierInvoiceNo}` : ''}`, `Purchase invoice${purchase.supplierInvoiceNo ? ` #${purchase.supplierInvoiceNo}` : ''}`)}
        subtitle={
          <>
            <Link to={`/suppliers/${purchase.supplierId}`} className="text-brand-700">{supplier?.name}</Link>
            {' · '}
            <span className="num">{formatDate(purchase.date)}</span>
          </>
        }
        back={{ to: `/suppliers/${purchase.supplierId}`, label: supplier?.name ?? ar.nav.suppliers }}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={t("الإجمالي", "Total")} value={formatOMR(purchase.totalBaisa)} />
        <Stat label={t("مدفوع عنها", "Paid against it")} value={formatOMR(paid)} />
        <Stat label={t("المتبقي", "Remaining")} value={formatOMR(purchase.totalBaisa - paid)} tone={purchase.totalBaisa - paid > 0 ? 'red' : 'green'} />
      </div>

      <Card className="!p-0 mb-5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="px-5 py-3 text-start font-medium">{t("الصنف", "Item")}</th>
              <th className="py-3 pe-4 text-start font-medium">{t("الكمية", "Quantity")}</th>
              <th className="py-3 pe-4 text-start font-medium">{t("سعر الوحدة", "Unit price")}</th>
              <th className="py-3 pe-5 text-start font-medium">{t("المجموع", "Total")}</th>
            </tr>
          </thead>
          <tbody>
            {purchase.lines.map((l, i) => {
              const item = itemById.get(l.itemId)
              return (
                <tr key={i} className="border-b border-stone-100 last:border-0">
                  <td className="px-5 py-3">
                    <Link to={`/inventory/${l.itemId}`} className="text-brand-700">{nameOf(item)}</Link>
                  </td>
                  <td className="py-3 pe-4"><span className="num">{formatQty(l.qty, item?.unit)}</span></td>
                  <td className="py-3 pe-4"><span className="num">{formatOMR(l.unitCostBaisa)}</span></td>
                  <td className="py-3 pe-5"><span className="num font-bold">{formatOMR(lineTotal(l.qty, l.unitCostBaisa))}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {!!payments?.length && (
        <Card className="mb-5">
          <h2 className="mb-2 font-bold">{t("الدفعات المرتبطة", "Linked payments")}</h2>
          <ul className="text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-stone-100 py-2 last:border-0">
                <span><span className="num">{formatDate(p.date)}</span> · {ar.paymentMethods[p.method]}</span>
                <span className="num font-bold text-emerald-700">{formatOMR(p.amountBaisa)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {purchase.notes && <Card className="mb-5 text-sm text-stone-600">{purchase.notes}</Card>}

      <Button variant="ghost" className="text-red-700" onClick={remove}>
        <Trash2 className="size-4" /> {t("حذف الفاتورة", "Delete invoice")}
      </Button>
      <p className="mt-1 text-xs text-stone-500">{t("لتعديل فاتورة: احذفها ثم أدخلها من جديد.", "To edit an invoice: delete it and enter it again.")}</p>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {dialog}
    </>
  )
}
