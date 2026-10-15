import { t } from '../../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, FilePlus2, FileText, Phone, Plus, ReceiptText, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Segmented } from '../../components/form'
import { formatDate } from '../../components/format'
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import { formatOMR } from '../../domain/money'
import { invoiceStatus, quoteDisplayStatus } from '../../domain/sales'
import { ar } from '../../i18n/ar'
import { customerBalances, invoicePaidAmounts } from '../../services/customers'
import { CustomerFormModal } from '../sales/CustomerFormModal'
import { InvoiceStatusBadge, QuoteStatusBadge } from '../sales/StatusBadges'

type Tab = 'customers' | 'invoices' | 'quotes'

const byNewest = <T extends { date: string; createdAt: string }>(a: T, b: T) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)

export function CustomersPage() {
  const [tab, setTab] = useState<Tab>('customers')
  const [creating, setCreating] = useState(false)
  const customers = useLiveQuery(async () => (await db.customers.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'ar')), [])
  const invoices = useLiveQuery(async () => (await db.salesInvoices.toArray()).sort(byNewest), [])
  const quotes = useLiveQuery(async () => (await db.quotations.toArray()).sort(byNewest), [])
  const balances = useLiveQuery(() => customerBalances(db), [])
  const paid = useLiveQuery(() => invoicePaidAmounts(db), [])

  const names = new Map(customers?.map((c) => [c.id, c.name]))
  const now = today()
  const totalDue = [...(balances?.values() ?? [])].reduce((a, b) => a + Math.max(b, 0), 0)
  const overdue = invoices?.filter((i) => invoiceStatus(i.totalBaisa, paid?.get(i.id) ?? 0, i.dueDate, now) === 'overdue').length ?? 0
  const openQuotes = quotes?.filter((q) => ['draft', 'sent'].includes(quoteDisplayStatus(q, now))).length ?? 0

  return (
    <>
      <PageHeader
        title={ar.nav.customers}
        actions={
          <>
            <LinkButton to="/invoices/new">
              <ReceiptText className="size-5" /> {t("فاتورة", "Invoice")}
            </LinkButton>
            <LinkButton to="/quotes/new" variant="secondary">
              <FilePlus2 className="size-5" /> {t("عرض سعر", "Quotation")}
            </LinkButton>
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="size-5" /> {t("عميل", "Customer")}
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={t("المستحق على العملاء", "Owed by customers")} value={formatOMR(totalDue)} tone={totalDue > 0 ? 'red' : undefined} />
        <Stat label={t("فواتير متأخرة", "Overdue invoices")} value={overdue} tone={overdue ? 'red' : 'green'} />
        <Stat label={t("عروض أسعار مفتوحة", "Open quotations")} value={openQuotes} />
      </div>
      <div className="mb-5 max-w-md">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'customers', label: t("العملاء", "Customers") },
            { value: 'invoices', label: t("الفواتير", "Invoices") },
            { value: 'quotes', label: t("عروض الأسعار", "Quotations") },
          ]}
        />
      </div>

      {tab === 'customers' && (
        <Card className="!p-0 overflow-hidden">
          {customers && !customers.length && <EmptyState icon={Users} title={t("لا يوجد عملاء بعد", "No customers yet")} description={t("أضف عميلاً لإرسال عرض سعر أو فاتورة.", "Add a customer to send a quotation or invoice.")} />}
          <ul>
            {customers?.map((c) => {
              const due = balances?.get(c.id) ?? 0
              return (
                <li key={c.id} className="border-b border-stone-100 last:border-0">
                  <Link to={`/customers/${c.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {c.name} <Badge>{ar.customerTypes[c.type]}</Badge> {!c.active && <Badge>{t("موقوف", "Inactive")}</Badge>}
                      </div>
                      {c.phone && (
                        <div className="mt-0.5 flex items-center gap-1 text-sm text-stone-500">
                          <Phone className="size-3.5" /> <span className="num">{c.phone}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="text-xs text-stone-500">{t("المستحق", "Balance due")}</div>
                      <div className={`num font-bold ${due > 0 ? 'text-red-700' : 'text-stone-700'}`}>{formatOMR(due)}</div>
                    </div>
                    <ChevronLeft className="size-5 text-stone-400 ltr:rotate-180" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {tab === 'invoices' && (
        <Card className="!p-0 overflow-hidden">
          {invoices && !invoices.length && <EmptyState icon={ReceiptText} title={t("لا توجد فواتير بعد", "No invoices yet")} />}
          <ul>
            {invoices?.map((i) => (
              <li key={i.id} className="border-b border-stone-100 last:border-0">
                <Link to={`/invoices/${i.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone-50">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="num text-stone-500">{i.invoiceNo}</span> {names.get(i.customerId)}
                      <InvoiceStatusBadge status={invoiceStatus(i.totalBaisa, paid?.get(i.id) ?? 0, i.dueDate, now)} />
                    </div>
                    <div className="text-sm text-stone-500"><span className="num">{formatDate(i.date)}</span></div>
                  </div>
                  <div className="num font-bold">{formatOMR(i.totalBaisa)}</div>
                  <ChevronLeft className="size-5 text-stone-400 ltr:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'quotes' && (
        <Card className="!p-0 overflow-hidden">
          {quotes && !quotes.length && <EmptyState icon={FileText} title={t("لا توجد عروض أسعار بعد", "No quotations yet")} description={t("أرسل عرض سعر للعميل الجديد قبل الفاتورة.", "Send a quotation to new customers before invoicing.")} />}
          <ul>
            {quotes?.map((q) => (
              <li key={q.id} className="border-b border-stone-100 last:border-0">
                <Link to={`/quotes/${q.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone-50">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="num text-stone-500">{q.quoteNo}</span> {names.get(q.customerId)}
                      <QuoteStatusBadge status={quoteDisplayStatus(q, now)} />
                    </div>
                    <div className="text-sm text-stone-500">
                      <span className="num">{formatDate(q.date)}</span>
                      {q.validUntil && <> {t("· ساري حتى", "· valid until")} <span className="num">{formatDate(q.validUntil)}</span></>}
                    </div>
                  </div>
                  <div className="num font-bold">{formatOMR(q.totalBaisa)}</div>
                  <ChevronLeft className="size-5 text-stone-400 ltr:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CustomerFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
