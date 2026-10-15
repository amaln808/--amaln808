import { type DocLang, t } from '../../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { Banknote, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSettings } from '../../app/useSettings'
import { errorMessage, formatDate } from '../../components/format'
import { useConfirm } from '../../components/useConfirm'
import { Button, Card, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import { formatOMR } from '../../domain/money'
import { invoiceStatus } from '../../domain/sales'
import { ar } from '../../i18n/ar'
import { customerBalances, deleteCustomerPayment, invoicePaidAmounts } from '../../services/customers'
import { deleteInvoice } from '../../services/sales'
import { DocumentPanel } from '../documents/DocumentPanel'
import { CustomerPaymentModal } from './CustomerPaymentModal'
import { InvoiceStatusBadge } from './StatusBadges'

export function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const invoice = useLiveQuery(() => db.salesInvoices.get(id), [id])
  const customer = useLiveQuery(async () => (invoice ? db.customers.get(invoice.customerId) : undefined), [invoice?.customerId])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const paidMap = useLiveQuery(() => invoicePaidAmounts(db), [])
  const balances = useLiveQuery(() => customerBalances(db), [])
  const payments = useLiveQuery(() => db.customerPayments.where('invoiceId').equals(id).toArray(), [id])
  const quote = useLiveQuery(async () => (invoice?.quoteId ? db.quotations.get(invoice.quoteId) : undefined), [invoice?.quoteId])
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (invoice === undefined || !settings || !items || !paidMap) return null
  if (invoice === null) return <p>{t("الفاتورة غير موجودة", "Invoice not found")}</p>

  const paid = paidMap.get(invoice.id) ?? 0
  const remaining = invoice.totalBaisa - paid
  const status = invoiceStatus(invoice.totalBaisa, paid, invoice.dueDate, today())
  const itemMap = new Map(items.map((i) => [i.id, i]))

  const remove = async () => {
    const msg = [t("ستُعاد المنتجات إلى المخزون.", "The products will return to stock."), payments?.length ? t(`وسيتم حذف ${payments.length} دفعة مرتبطة بها.`, `${payments.length} linked payment(s) will also be deleted.`) : '', t("لا يمكن التراجع عن ذلك.", "This cannot be undone.")]
      .filter(Boolean)
      .join('\n')
    if (!(await confirm({ title: t(`حذف الفاتورة ${invoice.invoiceNo}`, `Delete invoice ${invoice.invoiceNo}`), message: msg, confirmLabel: t("حذف", "Delete"), danger: true }))) return
    try {
      await deleteInvoice(db, invoice.id)
      navigate(`/customers/${invoice.customerId}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const shareText = (lang: DocLang) => {
    const arText = `مرحباً ${customer?.name ?? ''}، مرفق فاتورة رقم ${invoice.invoiceNo} بمبلغ ${formatOMR(invoice.totalBaisa, 'ar')}${remaining > 0 && paid > 0 ? ` (المتبقي ${formatOMR(remaining, 'ar')})` : ''}. شكراً لتعاملكم مع ${settings.businessName}.`
    const enText = `Hello ${customer?.name ?? ''}, please find attached invoice ${invoice.invoiceNo} for ${formatOMR(invoice.totalBaisa, 'en')}${remaining > 0 && paid > 0 ? ` (remaining ${formatOMR(remaining, 'en')})` : ''}. Thank you for choosing ${settings.businessName}.`
    return lang === 'en' ? enText : lang === 'both' ? `${arText}\n\n${enText}` : arText
  }

  return (
    <>
      <PageHeader
        title={t(`فاتورة ${invoice.invoiceNo}`, `Invoice ${invoice.invoiceNo}`)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link to={`/customers/${invoice.customerId}`} className="text-brand-700">{customer?.name}</Link>·
            <span className="num">{formatDate(invoice.date)}</span>
            <InvoiceStatusBadge status={status} />
            {quote && <Link to={`/quotes/${quote.id}`} className="text-sm text-stone-500">{t("من عرض", "from quotation")} {quote.quoteNo}</Link>}
          </span>
        }
        back={{ to: `/customers/${invoice.customerId}`, label: customer?.name ?? ar.nav.customers }}
        actions={
          remaining > 0 && (
            <Button onClick={() => setPaying(true)}>
              <Banknote className="size-5" /> {t("تسجيل دفعة", "Record payment")}
            </Button>
          )
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={t("الإجمالي", "Total")} value={formatOMR(invoice.totalBaisa)} />
        <Stat label={t("المدفوع", "Paid")} value={formatOMR(paid)} />
        <Stat label={t("المتبقي", "Remaining")} value={formatOMR(remaining)} tone={remaining > 0 ? 'red' : 'green'} />
      </div>

      <DocumentPanel
        doc={{
          kind: 'invoice',
          number: invoice.invoiceNo,
          date: invoice.date,
          untilDate: invoice.dueDate,
          customer: customer ?? undefined,
          lines: invoice.lines,
          subtotalBaisa: invoice.subtotalBaisa,
          discountBaisa: invoice.discountBaisa,
          vatRatePercent: invoice.vatRatePercent,
          vatBaisa: invoice.vatBaisa,
          totalBaisa: invoice.totalBaisa,
          paidBaisa: paid,
          notes: invoice.notes,
        }}
        settings={settings}
        items={itemMap}
        shareText={shareText}
      />

      {!!payments?.length && (
        <Card className="mt-5">
          <h2 className="mb-2 font-bold">{t("الدفعات المرتبطة بالفاتورة", "Payments linked to this invoice")}</h2>
          <ul className="text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 border-b border-stone-100 py-2 last:border-0">
                <span><span className="num">{formatDate(p.date)}</span> · {ar.paymentMethods[p.method]}</span>
                <span className="flex items-center gap-2">
                  <span className="num font-bold text-emerald-700">{formatOMR(p.amountBaisa)}</span>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: t("حذف الدفعة", "Delete payment"), message: t("حذف هذه الدفعة؟", "Delete this payment?"), confirmLabel: t("حذف", "Delete"), danger: true })) await deleteCustomerPayment(db, p.id)
                    }}
                    className="flex size-10 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={t("حذف الدفعة", "Delete payment")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6">
        <Button variant="ghost" className="text-red-700" onClick={remove}>
          <Trash2 className="size-4" /> {t("حذف الفاتورة", "Delete invoice")}
        </Button>
        <p className="mt-1 text-xs text-stone-500">{t("لتعديل فاتورة: احذفها ثم أدخلها من جديد.", "To edit an invoice: delete it and enter it again.")}</p>
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <CustomerPaymentModal
        open={paying}
        onClose={() => setPaying(false)}
        customerId={invoice.customerId}
        invoiceId={invoice.id}
        balanceBaisa={balances?.get(invoice.customerId) ?? 0}
      />
      {dialog}
    </>
  )
}
