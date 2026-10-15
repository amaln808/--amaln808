import { t } from '../../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { Banknote, Pencil, Phone, Power, ShoppingCart, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, formatDate } from '../../components/format'
import { useConfirm } from '../../components/useConfirm'
import { Badge, Button, Card, LinkButton, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import { formatOMR } from '../../domain/money'
import { ar } from '../../i18n/ar'
import { deleteSupplier, deleteSupplierPayment, saveSupplier, supplierStatement } from '../../services/suppliers'
import { PaymentModal } from './PaymentModal'
import { SupplierFormModal } from './SupplierFormModal'

export function SupplierDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const supplier = useLiveQuery(() => db.suppliers.get(id), [id])
  const statement = useLiveQuery(() => supplierStatement(db, id), [id])
  const purchases = useLiveQuery(() => db.purchases.where('supplierId').equals(id).toArray(), [id])
  const payments = useLiveQuery(() => db.supplierPayments.where('supplierId').equals(id).toArray(), [id])
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (supplier === undefined) return null
  if (supplier === null) return <p>{t("المورد غير موجود", "Supplier not found")}</p>

  const purchaseById = new Map(purchases?.map((p) => [p.id, p]))
  const paymentById = new Map(payments?.map((p) => [p.id, p]))
  const balance = statement?.at(-1)?.balanceBaisa ?? 0
  const totalPurchases = purchases?.reduce((s, p) => s + p.totalBaisa, 0) ?? 0
  const totalPaid = payments?.reduce((s, p) => s + p.amountBaisa, 0) ?? 0

  const removePayment = async (paymentId: string) => {
    if (!(await confirm({ title: t("حذف الدفعة", "Delete payment"), message: t("حذف هذه الدفعة؟ سيزيد المستحق للمورد بمقدارها.", "Delete this payment? The amount owed to the supplier will increase by it."), confirmLabel: t("حذف", "Delete"), danger: true }))) return
    await deleteSupplierPayment(db, paymentId)
  }

  const remove = async () => {
    if (!(await confirm({ title: t("حذف المورد", "Delete supplier"), message: t(`حذف «${supplier.name}»؟`, `Delete “${supplier.name}”?`), confirmLabel: t("حذف", "Delete"), danger: true }))) return
    try {
      await deleteSupplier(db, supplier.id)
      navigate('/suppliers')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title={supplier.name}
        subtitle={
          supplier.phone && (
            <a href={`tel:${supplier.phone}`} className="inline-flex items-center gap-1 text-brand-700">
              <Phone className="size-4" /> <span className="num">{supplier.phone}</span>
            </a>
          )
        }
        back={{ to: '/suppliers', label: ar.nav.suppliers }}
        actions={
          <>
            <LinkButton to={`/purchases/new?supplier=${supplier.id}`}>
              <ShoppingCart className="size-4" /> {t("فاتورة شراء", "Purchase invoice")}
            </LinkButton>
            <Button variant="secondary" onClick={() => setPaying(true)}>
              <Banknote className="size-4" /> {t("تسجيل دفعة", "Record payment")}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> {t("تعديل", "Edit")}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={t("إجمالي المشتريات", "Total purchases")} value={formatOMR(totalPurchases)} />
        <Stat label={t("إجمالي المدفوع", "Total paid")} value={formatOMR(totalPaid)} />
        <Stat label={t("المستحق للمورد", "Owed to supplier")} value={formatOMR(balance)} tone={balance > 0 ? 'red' : 'green'} />
      </div>

      {(supplier.address || supplier.email || supplier.notes) && (
        <Card className="mb-5 text-sm">
          {supplier.address && <p>{t("العنوان:", "Address:")} {supplier.address}</p>}
          {supplier.email && <p>{t("البريد:", "Email:")} <span dir="ltr">{supplier.email}</span></p>}
          {supplier.notes && <p className="text-stone-500">{supplier.notes}</p>}
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <h2 className="px-5 pt-4 pb-2 text-lg font-bold">{t("كشف الحساب", "Statement of account")}</h2>
        {!statement?.length && <p className="px-5 pb-5 text-stone-500">{t("لا توجد حركات بعد.", "No movements yet.")}</p>}
        {!!statement?.length && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-sm">
              <thead className="text-stone-500">
                <tr className="border-b border-stone-200">
                  <th className="px-5 py-2 text-start font-medium">{t("التاريخ", "Date")}</th>
                  <th className="py-2 pe-4 text-start font-medium">{t("البيان", "Description")}</th>
                  <th className="py-2 pe-4 text-start font-medium">{t("مشتريات", "Purchases")}</th>
                  <th className="py-2 pe-4 text-start font-medium">{t("مدفوع", "Paid")}</th>
                  <th className="py-2 pe-4 text-start font-medium">{t("الرصيد", "Balance")}</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {statement.map((row) => {
                  const purchase = purchaseById.get(row.id)
                  const payment = paymentById.get(row.id)
                  return (
                    <tr key={row.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-5 py-3"><span className="num">{formatDate(row.date)}</span></td>
                      <td className="py-3 pe-4">
                        {purchase ? (
                          <Link to={`/purchases/${purchase.id}`} className="text-brand-700">
                            {t("فاتورة شراء", "Purchase invoice")}{purchase.supplierInvoiceNo && <span className="num"> #{purchase.supplierInvoiceNo}</span>}
                          </Link>
                        ) : (
                          <>{t("دفعة —", "Payment —")} {payment && ar.paymentMethods[payment.method]}</>
                        )}
                      </td>
                      <td className="py-3 pe-4"><span className="num">{row.chargeBaisa ? formatOMR(row.chargeBaisa) : ''}</span></td>
                      <td className="py-3 pe-4"><span className="num text-emerald-700">{row.paymentBaisa ? formatOMR(row.paymentBaisa) : ''}</span></td>
                      <td className="py-3 pe-4"><span className="num font-bold">{formatOMR(row.balanceBaisa)}</span></td>
                      <td className="pe-3">
                        {payment && (
                          <button onClick={() => removePayment(payment.id)} className="flex size-10 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label={t("حذف الدفعة", "Delete payment")}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => saveSupplier(db, { ...supplier, active: !supplier.active }, supplier.id)}>
          <Power className="size-4" /> {supplier.active ? t("إيقاف المورد", "Deactivate supplier") : t("إعادة تفعيل المورد", "Reactivate supplier")}
        </Button>
        <Button variant="ghost" className="text-red-700" onClick={remove}>
          <Trash2 className="size-4" /> {t("حذف", "Delete")}
        </Button>
        {!supplier.active && <Badge>{t("موقوف", "Inactive")}</Badge>}
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <SupplierFormModal open={editing} onClose={() => setEditing(false)} supplier={supplier} />
      <PaymentModal open={paying} onClose={() => setPaying(false)} supplierId={supplier.id} balanceBaisa={balance} />
      {dialog}
    </>
  )
}
