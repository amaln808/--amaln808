import { ClipboardList, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Combobox, DateInput, Field, FormError, NumberInput, Segmented, Select, Textarea } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { createOrder, fetchOrders, type Order, ORDERS_KEY, type OrderStatus, updateOrder } from '../../data/orders'
import { fetchSales, SALES_KEY } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { baisaToInput, formatOMR, parseRialToBaisa } from '../../domain/money'
import { daysUntil, orderProgress } from '../../domain/orders'
import { formatQty, parseQty } from '../../domain/quantity'
import { nameKey } from '../../domain/text'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'
import { Stepper } from './steps'

/** «الاستلام بعد 12 يوماً» / «متأخرة 3 أيام» */
export function dueLabel(due: string, today: string): { text: string; late: boolean } {
  const d = daysUntil(due, today)
  if (d < 0) return { text: t(`متأخرة ${-d} يوماً`, `${-d} days late`), late: true }
  if (d === 0) return { text: t('الاستلام اليوم', 'Due today'), late: false }
  return { text: t(`بعد ${d} يوماً`, `in ${d} days`), late: false }
}

/** New order, or the details of an existing one (its stages are edited on its page). */
export function OrderFormModal({ order, onClose }: { order?: Order; onClose: (id?: string) => void }) {
  const sales = useQuery(SALES_KEY, fetchSales)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const customers = (sales.data?.customers ?? []).filter((c) => c.active)
  const products = (items.data ?? []).filter((i) => i.type === 'finished' && i.active)
  const [customerName, setCustomerName] = useState(() => sales.data?.customers.find((c) => c.id === order?.customerId)?.name ?? '')
  const [productId, setProductId] = useState(order?.productId ?? '')
  const [qty, setQty] = useState(order?.qty != null ? String(order.qty) : '')
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? todayIso())
  const [dueDate, setDueDate] = useState(order?.dueDate ?? '')
  const [amount, setAmount] = useState(order?.amountBaisa != null ? baisaToInput(order.amountBaisa) : '')
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    const customer = customers.find((c) => nameKey(c.name) === nameKey(customerName))
    const q = qty.trim() ? parseQty(qty) : null
    const a = amount.trim() ? parseRialToBaisa(amount) : null
    if (!customerName.trim()) return setError(t('اسم العميل مطلوب.', 'The customer name is required.'))
    if (qty.trim() && !q) return setError(t('الكمية غير صحيحة.', 'Invalid quantity.'))
    if (amount.trim() && (a == null || a < 0)) return setError(t('القيمة غير صحيحة.', 'Invalid amount.'))
    if (dueDate && dueDate < orderDate) return setError(t('تاريخ الاستلام قبل تاريخ الطلب.', 'The delivery date is before the order date.'))
    setBusy(true)
    try {
      const fields = { productId: productId || null, qty: q, orderDate, dueDate: dueDate || null, amountBaisa: a, notes: notes.trim() || null }
      if (order) {
        if (!customer) return setError(t('يُرجى اختيار عميل مسجّل، أو إضافته أولاً من «العملاء والمبيعات».', 'Pick a saved customer, or add it first under Customers & sales.'))
        await updateOrder(order.id, { ...fields, customerId: customer.id })
        onClose(order.id)
      } else {
        onClose(await createOrder({ ...fields, customerId: customer?.id ?? null, customerName: customerName.trim() }))
      }
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => onClose()}
      title={order ? t(`تعديل الطلبية ${order.orderNo}`, `Edit order ${order.orderNo}`) : t('طلبية جديدة', 'New order')}
      footer={
        <Button className="flex-1" onClick={save} disabled={busy}>
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('العميل', 'Customer')} className="sm:col-span-2" hint={!order && customerName.trim() && !customers.some((c) => nameKey(c.name) === nameKey(customerName)) ? t('عميل جديد، يُضاف عند الحفظ', 'New customer, added on save') : undefined}>
          <Combobox value={customerName} onChange={setCustomerName} options={customers.map((c) => ({ label: c.name, hint: c.phone ?? undefined }))} newLabel={t('جديد', 'New')} />
        </Field>
        <Field label={t('النوع (المنتج)', 'Product')}>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">{t('اختيار المنتج…', 'Choose product…')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {nameOf(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('الكمية المطلوبة', 'Quantity ordered')}>
          <NumberInput value={qty} onChange={(e) => setQty(e.target.value)} suffix={t('عبوة', 'jars')} />
        </Field>
        <Field label={t('تاريخ الطلب', 'Order date')}>
          <DateInput value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field label={t('تاريخ الاستلام المطلوب', 'Delivery date wanted')}>
          <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label={t('القيمة المتفق عليها (اختياري)', 'Agreed value (optional)')}>
          <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
        </Field>
        <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {!order && (
        <p className="mt-3 text-sm text-muted">
          {t(
            'تُضاف المراحل تلقائياً: عرض الأسعار، موافقة العميل، التصنيع، التوصيل، الدفعة — ثم تُحدَّد تواريخها في صفحة الطلبية.',
            'Stages are added for you: quotation, approval, production, delivery, payment — set their dates on the order page.',
          )}
        </p>
      )}
      <FormError message={error} />
    </Modal>
  )
}

/** Every order with its stages at a glance: what is next, what is late, when it is due. */
export function OrdersPage() {
  const q = useQuery(ORDERS_KEY, fetchOrders)
  const sales = useQuery(SALES_KEY, fetchSales)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const navigate = useNavigate()
  const [status, setStatus] = useState<OrderStatus>('open')
  const [adding, setAdding] = useState(false)
  const today = todayIso()
  const customerName = (id: string) => sales.data?.customers.find((c) => c.id === id)?.name ?? '—'
  const product = (id: string | null) => (items.data ?? []).find((i) => i.id === id)
  const orders = (q.data ?? []).filter((o) => o.status === status)
  const count = (s: OrderStatus) => (q.data ?? []).filter((o) => o.status === s).length

  return (
    <>
      <PageHeader
        title={t('الطلبيات', 'Orders')}
        subtitle={t('مراحل كل طلبية وتواريخها من الطلب حتى آخر دفعة.', 'Each order’s stages and dates, from the request to the last payment.')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-5" />
            {t('طلبية جديدة', 'New order')}
          </Button>
        }
      />
      <div className="mb-5 max-w-md">
        <Segmented<OrderStatus>
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: t(`جارية (${count('open')})`, `Open (${count('open')})`) },
            { value: 'done', label: t(`منجزة (${count('done')})`, `Done (${count('done')})`) },
            { value: 'cancelled', label: t(`ملغاة (${count('cancelled')})`, `Cancelled (${count('cancelled')})`) },
          ]}
        />
      </div>
      {q.error && !q.data && <FormError message={serverError(q.error)} />}
      {!orders.length ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={q.loading ? t('جارٍ التحميل…', 'Loading…') : status === 'open' ? t('لا توجد طلبيات جارية', 'No open orders') : t('لا يوجد شيء هنا', 'Nothing here')}
            description={status === 'open' && !q.loading ? t('عند اتفاق عميل على طلبية، يُرجى إضافتها هنا لمتابعة مراحلها.', 'When a customer agrees an order, add it here to follow its stages.') : undefined}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((o) => {
            const p = orderProgress(o.steps, today)
            const due = o.dueDate && o.status === 'open' ? dueLabel(o.dueDate, today) : null
            const prod = product(o.productId)
            return (
              <Link key={o.id} to={`/orders/${o.id}`} className="block rounded-2xl border border-line bg-card p-4 hover:ring-2 hover:ring-brand-200">
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="num text-sm text-muted">{o.orderNo}</span>
                  <span className="min-w-0 flex-1 text-lg font-bold">{customerName(o.customerId)}</span>
                  {o.amountBaisa != null && <span className="num font-bold">{formatOMR(o.amountBaisa)}</span>}
                </div>
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {prod && (
                    <span>
                      {nameOf(prod)}
                      {o.qty != null && <b className="num"> × {formatQty(o.qty)}</b>}
                    </span>
                  )}
                  <span className="text-muted">{t(`الطلب ${formatDate(o.orderDate)}`, `Ordered ${formatDate(o.orderDate)}`)}</span>
                  {o.dueDate && (
                    <span className={due?.late ? 'font-bold text-red-700' : 'text-muted'}>
                      {t(`الاستلام ${formatDate(o.dueDate)}`, `Delivery ${formatDate(o.dueDate)}`)}
                      {due && ` — ${due.text}`}
                    </span>
                  )}
                </div>
                <Stepper steps={o.steps} today={today} />
                {o.status === 'open' && p.next && (
                  <p className={`mt-2 text-sm ${p.late.length ? 'font-bold text-red-700' : 'text-brand-800'}`}>
                    {p.late.length
                      ? t(`${p.late.length} مرحلة متأخرة — التالي: ${p.next.title}`, `${p.late.length} late — next: ${p.next.title}`)
                      : t(`التالي: ${p.next.title}`, `Next: ${p.next.title}`)}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
      {adding && <OrderFormModal onClose={(id) => (setAdding(false), id && navigate(`/orders/${id}`))} />}
    </>
  )
}
