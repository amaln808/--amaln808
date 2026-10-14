import { useLiveQuery } from 'dexie-react-hooks'
import { Banknote, FilePlus2, MessageCircle, Pencil, Phone, Power, ReceiptText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, formatDate } from '../../components/format'
import { useConfirm } from '../../components/useConfirm'
import { Badge, Button, Card, LinkButton, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import { formatOMR } from '../../domain/money'
import { invoiceStatus, quoteDisplayStatus, toWhatsAppNumber } from '../../domain/sales'
import { ar } from '../../i18n/ar'
import { customerStatement, deleteCustomer, deleteCustomerPayment, invoicePaidAmounts, saveCustomer } from '../../services/customers'
import { CustomerFormModal } from '../sales/CustomerFormModal'
import { CustomerPaymentModal } from '../sales/CustomerPaymentModal'
import { InvoiceStatusBadge, QuoteStatusBadge } from '../sales/StatusBadges'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const customer = useLiveQuery(() => db.customers.get(id), [id])
  const statement = useLiveQuery(() => customerStatement(db, id), [id])
  const invoices = useLiveQuery(() => db.salesInvoices.where('customerId').equals(id).toArray(), [id])
  const payments = useLiveQuery(() => db.customerPayments.where('customerId').equals(id).toArray(), [id])
  const quotes = useLiveQuery(
    async () => (await db.quotations.where('customerId').equals(id).toArray()).sort((a, b) => b.date.localeCompare(a.date)),
    [id],
  )
  const paid = useLiveQuery(() => invoicePaidAmounts(db), [])
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (customer === undefined) return null
  if (customer === null) return <p>العميل غير موجود</p>

  const now = today()
  const invoiceById = new Map(invoices?.map((i) => [i.id, i]))
  const paymentById = new Map(payments?.map((p) => [p.id, p]))
  const balance = statement?.at(-1)?.balanceBaisa ?? 0
  const totalSales = invoices?.reduce((s, i) => s + i.totalBaisa, 0) ?? 0
  const totalPaid = payments?.reduce((s, p) => s + p.amountBaisa, 0) ?? 0
  const wa = toWhatsAppNumber(customer.phone)

  const remove = async () => {
    if (!(await confirm({ title: 'حذف العميل', message: `حذف «${customer.name}»؟`, confirmLabel: 'حذف', danger: true }))) return
    try {
      await deleteCustomer(db, customer.id)
      navigate('/customers')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <Badge>{ar.customerTypes[customer.type]}</Badge>
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 text-brand-700">
                <Phone className="size-4" /> <span className="num">{customer.phone}</span>
              </a>
            )}
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#1a9e4b]">
                <MessageCircle className="size-4" /> واتساب
              </a>
            )}
          </span>
        }
        back={{ to: '/customers', label: ar.nav.customers }}
        actions={
          <>
            <LinkButton to={`/invoices/new?customer=${customer.id}`}>
              <ReceiptText className="size-4" /> فاتورة
            </LinkButton>
            <LinkButton to={`/quotes/new?customer=${customer.id}`} variant="secondary">
              <FilePlus2 className="size-4" /> عرض سعر
            </LinkButton>
            <Button variant="secondary" onClick={() => setPaying(true)}>
              <Banknote className="size-4" /> دفعة
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="إجمالي المبيعات" value={formatOMR(totalSales)} />
        <Stat label="إجمالي المدفوع" value={formatOMR(totalPaid)} />
        <Stat label="المستحق" value={formatOMR(balance)} tone={balance > 0 ? 'red' : 'green'} />
      </div>

      {!!quotes?.length && (
        <Card className="!p-0 mb-5 overflow-hidden">
          <h2 className="px-5 pt-4 pb-2 text-lg font-bold">عروض الأسعار</h2>
          <ul>
            {quotes.map((q) => (
              <li key={q.id} className="border-t border-stone-100">
                <Link to={`/quotes/${q.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-stone-50">
                  <span className="num font-medium">{q.quoteNo}</span>
                  <span className="num text-stone-500">{formatDate(q.date)}</span>
                  <QuoteStatusBadge status={quoteDisplayStatus(q, now)} />
                  <span className="num ms-auto font-bold">{formatOMR(q.totalBaisa)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <h2 className="px-5 pt-4 pb-2 text-lg font-bold">كشف الحساب</h2>
        {!statement?.length && <p className="px-5 pb-5 text-stone-500">لا توجد فواتير أو دفعات بعد.</p>}
        {!!statement?.length && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-stone-500">
                <tr className="border-b border-stone-200">
                  <th className="px-5 py-2 text-start font-medium">التاريخ</th>
                  <th className="py-2 pe-4 text-start font-medium">البيان</th>
                  <th className="py-2 pe-4 text-start font-medium">فواتير</th>
                  <th className="py-2 pe-4 text-start font-medium">مدفوع</th>
                  <th className="py-2 pe-4 text-start font-medium">الرصيد</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {statement.map((row) => {
                  const inv = invoiceById.get(row.id)
                  const pay = paymentById.get(row.id)
                  return (
                    <tr key={row.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-5 py-3"><span className="num">{formatDate(row.date)}</span></td>
                      <td className="py-3 pe-4">
                        {inv ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Link to={`/invoices/${inv.id}`} className="num text-brand-700">{inv.invoiceNo}</Link>
                            <InvoiceStatusBadge status={invoiceStatus(inv.totalBaisa, paid?.get(inv.id) ?? 0, inv.dueDate, now)} />
                          </span>
                        ) : (
                          <>دفعة — {pay && ar.paymentMethods[pay.method]}</>
                        )}
                      </td>
                      <td className="py-3 pe-4"><span className="num">{row.chargeBaisa ? formatOMR(row.chargeBaisa) : ''}</span></td>
                      <td className="py-3 pe-4"><span className="num text-emerald-700">{row.paymentBaisa ? formatOMR(row.paymentBaisa) : ''}</span></td>
                      <td className="py-3 pe-4"><span className="num font-bold">{formatOMR(row.balanceBaisa)}</span></td>
                      <td className="pe-3">
                        {pay && (
                          <button
                            onClick={async () => {
                              if (await confirm({ title: 'حذف الدفعة', message: 'حذف هذه الدفعة؟ سيزيد المستحق على العميل بمقدارها.', confirmLabel: 'حذف', danger: true }))
                                await deleteCustomerPayment(db, pay.id)
                            }}
                            className="flex size-10 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="حذف الدفعة"
                          >
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

      {(customer.address || customer.notes) && (
        <Card className="mt-5 text-sm">
          {customer.address && <p>العنوان: {customer.address}</p>}
          {customer.notes && <p className="text-stone-500">{customer.notes}</p>}
        </Card>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => saveCustomer(db, { ...customer, active: !customer.active }, customer.id)}>
          <Power className="size-4" /> {customer.active ? 'إيقاف العميل' : 'إعادة تفعيل العميل'}
        </Button>
        <Button variant="ghost" className="text-red-700" onClick={remove}>
          <Trash2 className="size-4" /> حذف
        </Button>
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <CustomerFormModal open={editing} onClose={() => setEditing(false)} customer={customer} />
      <CustomerPaymentModal open={paying} onClose={() => setPaying(false)} customerId={customer.id} balanceBaisa={balance} />
      {dialog}
    </>
  )
}
