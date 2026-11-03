import { Check, CheckCircle2, FileText, Pencil, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DateInput, Field, FormError, NumberInput, Select, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Badge, Button, Card, PageHeader } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import type { PaymentMethod } from '../../data/inventory'
import { deleteOrder, deleteStep, fetchOrders, type Order, type OrderStep, ORDERS_KEY, saveStep, updateOrder } from '../../data/orders'
import { deleteCustomerPayment, fetchSales, recordCustomerPayment, SALES_KEY, updateCustomerPayment } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { baisaToInput, formatOMR, parseRialToBaisa } from '../../domain/money'
import { orderProgress, type StepKind, stepState } from '../../domain/orders'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { invoiceStatusLabel, quoteStatusLabel, quoteStatusOf, summarize } from '../sales/summary'
import { METHODS, methodLabel } from '../inventory/labels'
import { formatDate } from '../tasks/labels'
import { dueLabel, OrderFormModal } from './OrdersPage'
import { DOT, stateLabel } from './steps'

type StepDraft = Partial<OrderStep> & { kind: StepKind }

/** Add or edit one stage: its name, planned date, done date, amount (payments) and notes. */
function StepModal({ order, step, nextSort, onClose }: { order: Order; step: StepDraft; nextSort: number; onClose: () => void }) {
  const orderId = order.id
  const [title, setTitle] = useState(step.title ?? '')
  const [planned, setPlanned] = useState(step.plannedDate ?? '')
  const [done, setDone] = useState(step.doneDate ?? '')
  const [amount, setAmount] = useState(step.amountBaisa != null ? baisaToInput(step.amountBaisa) : '')
  const [notes, setNotes] = useState(step.notes ?? '')
  const [method, setMethod] = useState<PaymentMethod>(step.method ?? 'bank')
  // Also record the money in the customer's account (المقبوضات), once
  const [record, setRecord] = useState(!step.paymentId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { confirm, dialog } = useConfirm()
  const isPayment = step.kind === 'payment'

  const save = async () => {
    setError(null)
    const a = amount.trim() ? parseRialToBaisa(amount) : null
    if (!title.trim()) return setError(t('اسم المرحلة مطلوب.', 'The stage name is required.'))
    if (amount.trim() && (a == null || a < 0)) return setError(t('المبلغ غير صحيح.', 'Invalid amount.'))
    if (isPayment && done && !a) return setError(t('يُرجى كتابة المبلغ المستلم.', 'Enter the amount received.'))
    setBusy(true)
    try {
      // The receipt in the customer's account follows the stage: added, changed, or removed with it
      let paymentId = step.paymentId ?? null
      if (isPayment && paymentId && !done) {
        await deleteCustomerPayment(paymentId)
        paymentId = null
      } else if (isPayment && paymentId && done && a) {
        await updateCustomerPayment(paymentId, { date: done, amountBaisa: a, method })
      } else if (isPayment && !paymentId && done && a && record) {
        paymentId = await recordCustomerPayment({
          customerId: order.customerId,
          invoiceId: order.invoiceId,
          date: done,
          amountBaisa: a,
          method,
          notes: t(`طلبية ${order.orderNo} — ${title.trim()}`, `Order ${order.orderNo} — ${title.trim()}`),
        })
      }
      await saveStep({
        id: step.id,
        orderId,
        kind: step.kind,
        title: title.trim(),
        plannedDate: planned || null,
        doneDate: done || null,
        amountBaisa: isPayment ? a : null,
        method: isPayment && done ? method : null,
        paymentId: isPayment ? paymentId : null,
        notes: notes.trim() || null,
        sortOrder: step.sortOrder ?? nextSort,
      })
      onClose()
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!step.id) return
    const message = step.paymentId
      ? t(`حذف «${step.title}»؟ يُحذف المبلغ المسجّل في المقبوضات معها.`, `Delete «${step.title}»? Its recorded receipt is deleted too.`)
      : t(`حذف «${step.title}»؟`, `Delete «${step.title}»?`)
    if (!(await confirm({ title: t('حذف المرحلة', 'Delete stage'), message, confirmLabel: t('حذف', 'Delete'), danger: true }))) return
    try {
      if (step.paymentId) await deleteCustomerPayment(step.paymentId)
      await deleteStep(step.id)
      onClose()
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={step.id ? t('تعديل المرحلة', 'Edit stage') : isPayment ? t('دفعة جديدة', 'New payment') : t('مرحلة جديدة', 'New stage')}
      footer={
        <>
          <Button className="flex-1" onClick={save} disabled={busy}>
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {step.id && (
            <Button variant="ghost" className="text-red-700" onClick={remove} disabled={busy}>
              <Trash2 className="size-4" />
              {t('حذف', 'Delete')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('اسم المرحلة', 'Stage name')} className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isPayment ? t('مثلاً: دفعة مقدمة 50%', 'e.g. 50% advance') : t('مثلاً: تجهيز الملصقات', 'e.g. labels ready')} />
        </Field>
        <Field label={t('التاريخ المخطط', 'Planned date')}>
          <DateInput value={planned} onChange={(e) => setPlanned(e.target.value)} />
        </Field>
        <Field label={isPayment ? t('تاريخ الاستلام الفعلي', 'Received on') : t('تاريخ الإنجاز', 'Done on')} hint={t('يُترك فارغاً حتى تتم', 'Leave empty until done')}>
          <DateInput value={done} onChange={(e) => setDone(e.target.value)} />
        </Field>
        {isPayment && (
          <Field label={t('المبلغ', 'Amount')}>
            <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
          </Field>
        )}
        {isPayment && done && (
          <Field label={t('طريقة الدفع', 'Paid by')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isPayment && done && (
          <div className="sm:col-span-2">
            {step.paymentId ? (
              <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm">{t('هذه الدفعة مسجّلة في حساب العميل (المقبوضات)، وتتغير معها عند الحفظ.', 'This payment is recorded in the customer’s account, and is updated with it on save.')}</p>
            ) : (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={record} onChange={(e) => setRecord(e.target.checked)} />
                {t('تسجيل المبلغ في حساب العميل (المقبوضات) أيضاً', 'Also record the amount in the customer’s account')}
              </label>
            )}
          </div>
        )}
        <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <FormError message={error} />
      {dialog}
    </Modal>
  )
}

/** One order: details, links to its quotation and invoice, and its stages with dates. */
export function OrderPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const q = useQuery(ORDERS_KEY, fetchOrders)
  const sales = useQuery(SALES_KEY, fetchSales)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const [editing, setEditing] = useState(false)
  const [stepDraft, setStepDraft] = useState<StepDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const today = todayIso()
  const order = q.data?.find((o) => o.id === id)

  if (!order) {
    return (
      <>
        <PageHeader title={t('طلبية', 'Order')} back={{ to: '/orders', label: t('الطلبيات', 'Orders') }} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{q.loading ? t('جارٍ التحميل…', 'Loading…') : t('الطلبية غير موجودة.', 'Order not found.')}</p>}
      </>
    )
  }

  const customer = sales.data?.customers.find((c) => c.id === order.customerId)
  const product = (items.data ?? []).find((i) => i.id === order.productId)
  const quotation = sales.data?.quotations.find((x) => x.id === order.quotationId)
  const invoice = sales.data?.invoices.find((x) => x.id === order.invoiceId)
  const invoiceInfo = sales.data && invoice ? summarize(sales.data, today).invoiceInfo.get(invoice.id) : undefined
  const freeQuotes = (sales.data?.quotations ?? []).filter((x) => x.customerId === order.customerId && x.id !== order.quotationId)
  const p = orderProgress(order.steps, today)
  const due = order.dueDate && order.status === 'open' ? dueLabel(order.dueDate, today) : null
  const nextSort = Math.max(0, ...order.steps.map((s) => s.sortOrder)) + 1

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(serverError(e))
    }
  }
  const markDone = async (s: OrderStep) => {
    // A payment needs its date, amount and method: open its form, ready for today
    if (s.kind === 'payment') return setStepDraft(s.doneDate ? s : { ...s, doneDate: today })
    await run(() => saveStep({ id: s.id, orderId: order.id, doneDate: s.doneDate ? null : today }))
  }
  const linkQuote = (quotationId: string) =>
    run(async () => {
      const qt = sales.data?.quotations.find((x) => x.id === quotationId)
      await updateOrder(order.id, { quotationId, invoiceId: qt?.invoiceId ?? order.invoiceId })
      const quoteStep = order.steps.find((s) => s.kind === 'quote' && !s.doneDate)
      if (quoteStep && qt) await saveStep({ id: quoteStep.id, orderId: order.id, doneDate: qt.date })
      const approval = order.steps.find((s) => s.kind === 'approval' && !s.doneDate)
      if (approval && qt?.status === 'accepted') await saveStep({ id: approval.id, orderId: order.id, doneDate: today })
    })
  const setStatus = (status: 'open' | 'done' | 'cancelled') => run(() => updateOrder(order.id, { status }))
  const remove = async () => {
    if (!(await confirm({ title: t('حذف الطلبية', 'Delete order'), message: t('تُحذف الطلبية ومراحلها نهائياً (عرض الأسعار والفاتورة لا يتأثران).', 'The order and its stages are deleted (the quotation and invoice stay).'), confirmLabel: t('حذف', 'Delete'), danger: true }))) return
    await run(async () => {
      await deleteOrder(order.id)
      navigate('/orders', { replace: true })
    })
  }
  const newQuoteUrl = `/quotes/new?customer=${order.customerId}${order.productId ? `&product=${order.productId}` : ''}${order.qty ? `&qty=${order.qty}` : ''}&order=${order.id}`

  return (
    <>
      <PageHeader
        title={t(`طلبية ${order.orderNo}`, `Order ${order.orderNo}`)}
        subtitle={customer ? <Link to={`/customers/${customer.id}`} className="underline">{customer.name}</Link> : undefined}
        back={{ to: '/orders', label: t('الطلبيات', 'Orders') }}
        actions={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            {t('تعديل', 'Edit')}
          </Button>
        }
      />
      <div className="flex flex-col gap-5">
        <Card>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted">{t('النوع', 'Product')}</dt>
              <dd className="font-bold">{product ? nameOf(product) : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('الكمية المطلوبة', 'Quantity')}</dt>
              <dd className="num font-bold">{order.qty != null ? t(`${formatQty(order.qty)} عبوة`, `${formatQty(order.qty)} jars`) : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('تاريخ الطلب', 'Order date')}</dt>
              <dd className="num font-bold">{formatDate(order.orderDate)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('تاريخ الاستلام', 'Delivery date')}</dt>
              <dd className={`num font-bold ${due?.late ? 'text-red-700' : ''}`}>
                {order.dueDate ? formatDate(order.dueDate) : '—'}
                {due && <span className="block text-xs font-normal">{due.text}</span>}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {order.status === 'open' ? <Badge tone="amber">{t('جارية', 'Open')}</Badge> : order.status === 'done' ? <Badge tone="green">{t('منجزة', 'Done')}</Badge> : <Badge>{t('ملغاة', 'Cancelled')}</Badge>}
            <span className="text-sm text-muted">{t(`أُنجز ${p.done} من ${p.total} مراحل`, `${p.done} of ${p.total} stages done`)}</span>
            {order.amountBaisa != null && <span className="text-sm">{t('القيمة المتفق عليها', 'Agreed value')} <b className="num">{formatOMR(order.amountBaisa)}</b></span>}
            <div className="ms-auto flex flex-wrap gap-2">
              {order.status === 'open' ? (
                <>
                  <Button variant="secondary" onClick={() => setStatus('done')}>
                    <CheckCircle2 className="size-4" />
                    {t('إنجاز الطلبية', 'Mark order done')}
                  </Button>
                  <Button variant="ghost" className="text-red-700" onClick={() => setStatus('cancelled')}>
                    <XCircle className="size-4" />
                    {t('إلغاء', 'Cancel')}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setStatus('open')}>
                  <RotateCcw className="size-4" />
                  {t('إعادة فتح', 'Reopen')}
                </Button>
              )}
            </div>
          </div>
          <FormError message={error} />
        </Card>

        {/* Quotation and invoice */}
        <Card>
          <h2 className="mb-3 text-lg font-bold">{t('عرض الأسعار والفاتورة', 'Quotation and invoice')}</h2>
          <div className="flex flex-col gap-3">
            {quotation ? (
              <Link to={`/quotes/${quotation.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3 hover:bg-brand-50">
                <FileText className="size-5 text-brand-800" />
                <span className="font-medium">{t(`عرض الأسعار ${quotation.quoteNo}`, `Quotation ${quotation.quoteNo}`)}</span>
                <span className="text-sm text-muted">{quoteStatusLabel(quoteStatusOf(quotation, today))}</span>
                <span className="num ms-auto font-bold">{formatOMR(quotation.totalBaisa)}</span>
              </Link>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => navigate(newQuoteUrl)}>
                  <Plus className="size-4" />
                  {t('إنشاء عرض أسعار لهذه الطلبية', 'Create a quotation for this order')}
                </Button>
                {freeQuotes.length > 0 && (
                  <Select value="" onChange={(e) => e.target.value && linkQuote(e.target.value)} aria-label={t('ربط عرض موجود', 'Link an existing quotation')} className="!w-auto">
                    <option value="">{t('أو ربط عرض موجود…', 'or link an existing one…')}</option>
                    {freeQuotes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.quoteNo} · {formatDate(x.date)} · {formatOMR(x.totalBaisa)}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}
            {invoice && (
              <Link to={`/invoices/${invoice.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3 hover:bg-brand-50">
                <FileText className="size-5 text-brand-800" />
                <span className="font-medium">{t(`الفاتورة ${invoice.invoiceNo}`, `Invoice ${invoice.invoiceNo}`)}</span>
                {invoiceInfo && <span className="text-sm text-muted">{invoiceStatusLabel(invoiceInfo.status)}</span>}
                <span className="ms-auto text-sm">
                  {t('المحصّل', 'Received')} <b className="num">{formatOMR(invoiceInfo?.paidBaisa ?? 0)}</b> / <span className="num">{formatOMR(invoice.totalBaisa)}</span>
                </span>
              </Link>
            )}
            {quotation && !invoice && <p className="text-sm text-muted">{t('عند ضغط «تم القبول» في عرض الأسعار تُصدر الفاتورة وتُعلَّم «موافقة العميل» هنا تلقائياً.', 'Pressing «Accepted» on the quotation issues the invoice and marks the approval here.')}</p>}
          </div>
        </Card>

        {/* Stages */}
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            <h2 className="flex-1 text-lg font-bold">{t('المراحل والتواريخ', 'Stages and dates')}</h2>
            <Button variant="ghost" onClick={() => setStepDraft({ kind: 'payment', title: t('دفعة', 'Payment') })}>
              <Plus className="size-4" />
              {t('إضافة دفعة', 'Add payment')}
            </Button>
            <Button variant="ghost" onClick={() => setStepDraft({ kind: 'other', title: '' })}>
              <Plus className="size-4" />
              {t('إضافة مرحلة', 'Add stage')}
            </Button>
          </div>
          {p.plannedPayBaisa > 0 && (
            <p className="px-5 pt-2 text-sm">
              {t('الدفعات المستلمة', 'Payments received')} <b className="num">{formatOMR(p.paidBaisa)}</b> {t('من', 'of')} <span className="num">{formatOMR(p.plannedPayBaisa)}</span>
            </p>
          )}
          <ol className="mt-3">
            {order.steps.map((s, i) => {
              const st = stepState(s, today)
              return (
                <li key={s.id} className="relative flex gap-3 px-5 pb-5">
                  {i < order.steps.length - 1 && <span className={`absolute start-[2.1rem] top-8 bottom-0 w-0.5 ${s.doneDate ? 'bg-palm' : 'bg-line'}`} aria-hidden />}
                  <span className={`relative z-10 mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${DOT[st]}`}>
                    {st === 'done' ? <Check className="size-4" /> : i + 1}
                  </span>
                  <button type="button" onClick={() => setStepDraft(s)} className="min-w-0 flex-1 rounded-xl px-2 py-1 text-start hover:bg-brand-50">
                    <div className="font-bold">{s.title}</div>
                    <div className="flex flex-wrap gap-x-3 text-sm">
                      {s.doneDate && s.kind === 'payment' ? (
                        <span className="text-palm">
                          {t(`استُلمت ${formatDate(s.doneDate)}`, `Received ${formatDate(s.doneDate)}`)}
                          {s.method && ` · ${methodLabel(s.method)}`}
                          {s.paymentId && t(' · في المقبوضات', ' · in receipts')}
                        </span>
                      ) : s.doneDate ? (
                        <span className="text-palm">{t(`تمت ${formatDate(s.doneDate)}`, `Done ${formatDate(s.doneDate)}`)}</span>
                      ) : s.kind === 'payment' && s.plannedDate ? (
                        <span className={st === 'late' ? 'font-bold text-red-700' : st === 'soon' ? 'text-amber-800' : 'text-muted'}>
                          {t(`مستحقة ${formatDate(s.plannedDate)}`, `Due ${formatDate(s.plannedDate)}`)} · {st === 'late' ? t('متأخرة', 'Late') : t('لم تُستلم بعد', 'Not received yet')}
                        </span>
                      ) : s.plannedDate ? (
                        <span className={st === 'late' ? 'font-bold text-red-700' : st === 'soon' ? 'text-amber-800' : 'text-muted'}>
                          {t(`مخطط ${formatDate(s.plannedDate)}`, `Planned ${formatDate(s.plannedDate)}`)} · {stateLabel(st)}
                        </span>
                      ) : (
                        <span className="text-muted">{t('لم يُحدَّد تاريخ — يُرجى الضغط لتحديده', 'No date yet — tap to set one')}</span>
                      )}
                      {s.kind === 'payment' && s.amountBaisa != null && <span className="num font-medium">{formatOMR(s.amountBaisa)}</span>}
                    </div>
                    {s.notes && <div className="mt-0.5 text-sm text-muted">{s.notes}</div>}
                  </button>
                  <Button variant={s.doneDate ? 'ghost' : 'secondary'} className="shrink-0 self-start" onClick={() => markDone(s)}>
                    {s.kind === 'payment' ? (s.doneDate ? t('تفاصيل', 'Details') : t('استلام', 'Receive')) : s.doneDate ? t('تراجع', 'Undo') : t('تمت', 'Done')}
                  </Button>
                </li>
              )
            })}
          </ol>
        </Card>

        <div>
          <Button variant="ghost" className="text-red-700" onClick={remove}>
            <Trash2 className="size-4" />
            {t('حذف الطلبية', 'Delete order')}
          </Button>
        </div>
      </div>
      {editing && <OrderFormModal order={order} onClose={() => setEditing(false)} />}
      {stepDraft && <StepModal order={order} step={stepDraft} nextSort={nextSort} onClose={() => setStepDraft(null)} />}
      {dialog}
    </>
  )
}
