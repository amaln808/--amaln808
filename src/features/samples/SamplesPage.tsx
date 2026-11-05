import { Gift, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Combobox, DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { fetchSales, SALES_KEY } from '../../data/sales'
import { deleteSamples, fetchSamples, giveSamples, SAMPLES_KEY } from '../../data/samples'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { formatOMR } from '../../domain/money'
import { formatQty, parseQty } from '../../domain/quantity'
import { nameKey } from '../../domain/text'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'

/** Record jars given away: they leave the ready stock (nearest expiry first) without an invoice. */
function SampleFormModal({ onClose }: { onClose: () => void }) {
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const sales = useQuery(SALES_KEY, fetchSales)
  const samples = useQuery(SAMPLES_KEY, fetchSamples)
  const products = (items.data ?? []).filter((i) => i.type === 'finished' && i.active)
  const [productId, setProductId] = useState(() => (products.length === 1 ? products[0].id : ''))
  const [qty, setQty] = useState('')
  const [recipient, setRecipient] = useState('')
  const [date, setDate] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const product = products.find((p) => p.id === productId)

  // Saved customers and earlier recipients, each once
  const seen = new Set<string>()
  const options = [
    ...(sales.data?.customers ?? []).filter((c) => c.active).map((c) => ({ label: c.name, hint: t('عميل', 'customer') })),
    ...(samples.data ?? []).map((s) => ({ label: s.recipient })),
  ].filter((o) => !seen.has(nameKey(o.label)) && !!seen.add(nameKey(o.label)))

  const save = async () => {
    setError(null)
    const q = parseQty(qty)
    if (!productId) return setError(t('يُرجى اختيار المنتج.', 'Please choose the product.'))
    if (!q || q <= 0) return setError(t('يُرجى كتابة عدد العبوات.', 'Please enter the number of jars.'))
    if (!recipient.trim()) return setError(t('يُرجى كتابة الجهة التي استلمت العينات.', 'Please say who received the samples.'))
    setBusy(true)
    try {
      await giveSamples({ productId, qty: q, recipient: recipient.trim(), date, notes: notes.trim() || null })
      onClose()
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('تسجيل عينات', 'Record samples')}
      footer={
        <Button className="flex-1" onClick={save} disabled={busy}>
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('المنتج', 'Product')} hint={product ? t(`الجاهز للبيع: ${formatQty(product.stock.sellableQty)} عبوة`, `Ready: ${formatQty(product.stock.sellableQty)} jars`) : undefined}>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">{t('اختيار المنتج…', 'Choose product…')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {nameOf(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('عدد العبوات', 'Jars')}>
          <NumberInput value={qty} onChange={(e) => setQty(e.target.value)} suffix={t('عبوة', 'jars')} />
        </Field>
        <Field label={t('الجهة التي استلمتها', 'Given to')} className="sm:col-span-2" hint={t('محل، صيدلية، معرض، جهة يجري التفاوض معها…', 'A shop, pharmacy, exhibition, a party you are talking to…')}>
          <Combobox value={recipient} onChange={setRecipient} options={options} />
        </Field>
        <Field label={t('التاريخ', 'Date')}>
          <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('الغرض أو ملاحظات (اختياري)', 'Purpose or notes (optional)')} className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('مثلاً: تعريف بالمنتج قبل اتفاقية توريد', 'e.g. product introduction before a supply agreement')} />
        </Field>
      </div>
      <p className="mt-3 text-sm text-muted">
        {t(
          'تُخصم العبوات من المخزون الجاهز للبيع بدءاً بالأقرب انتهاءً، دون فاتورة، وتُحسب تكلفتها في الأرباح كعينات ترويجية.',
          'The jars leave the ready stock, nearest expiry first, without an invoice; their cost counts in profit as promotional samples.',
        )}
      </p>
      <FormError message={error} />
    </Modal>
  )
}

/** Every sample given: to whom, which product, how many, and what they cost. */
export function SamplesPage() {
  const q = useQuery(SAMPLES_KEY, fetchSamples)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const list = q.data ?? []
  const year = todayIso().slice(0, 4)
  const thisYear = list.filter((s) => s.date.startsWith(year))
  const byId = new Map((items.data ?? []).map((i) => [i.id, i]))

  const remove = async (id: string) => {
    const ok = await confirm({
      title: t('حذف العينات', 'Delete samples'),
      message: t('يُحذف هذا السجل وتعود العبوات إلى المخزون الجاهز للبيع في دفعاتها نفسها.', 'This record is removed and the jars go back to ready stock, into the same batches.'),
      confirmLabel: t('حذف', 'Delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteSamples(id)
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <>
      <PageHeader
        title={t('العينات الترويجية', 'Promotional samples')}
        subtitle={t('العبوات الموزعة للترويج أو عند البحث عن اتفاقيات: تُخصم من المخزون الجاهز دون فاتورة.', 'Jars given away to promote the product or seek agreements: taken from ready stock without an invoice.')}
        back={{ to: '/ready', label: t('المخزون الجاهز للبيع', 'Ready for sale') }}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-5" />
            {t('تسجيل عينات', 'Record samples')}
          </Button>
        }
      />
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label={t(`عبوات وُزعت في ${year}`, `Jars given in ${year}`)} value={formatQty(thisYear.reduce((s, x) => s + x.qty, 0))} />
          <Stat label={t(`تكلفتها في ${year}`, `Their cost in ${year}`)} value={formatOMR(thisYear.reduce((s, x) => s + x.costBaisa, 0))} />
          <Stat label={t('جهات استلمت عينات', 'Recipients')} value={new Set(list.map((s) => nameKey(s.recipient))).size} />
        </div>
        <FormError message={error ?? (q.error && !q.data ? serverError(q.error) : null)} />
        <Card className="p-0">
          {!list.length ? (
            <EmptyState
              icon={Gift}
              title={q.loading ? t('جارٍ التحميل…', 'Loading…') : t('لم تُسجَّل عينات بعد', 'No samples recorded yet')}
              description={q.loading ? undefined : t('عند توزيع عبوات للترويج، يُرجى تسجيلها هنا لتُخصم من المخزون.', 'When you give jars away to promote the product, record them here so they leave the stock.')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {s.customerId ? (
                        <Link to={`/customers/${s.customerId}`} className="underline-offset-4 hover:underline">
                          {s.recipient}
                        </Link>
                      ) : (
                        s.recipient
                      )}
                    </div>
                    <div className="text-sm text-muted">
                      {formatDate(s.date)} · {nameOf(byId.get(s.productId))} × <b className="num">{formatQty(s.qty)}</b>
                      {s.notes ? ` · ${s.notes}` : ''}
                    </div>
                  </div>
                  <span className="num shrink-0 text-sm text-muted">{formatOMR(s.costBaisa)}</span>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-red-50 hover:text-red-700"
                    aria-label={t('حذف', 'Delete')}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {list.length > 0 && <p className="text-sm text-muted">{t('التكلفة = تكلفة إنتاج العبوات من دفعاتها الفعلية، وتظهر في لوحة المؤشرات والتقرير الشهري.', 'Cost = what the jars cost to make, from their actual batches; it shows on the dashboard and the monthly report.')}</p>}
      </div>
      {adding && <SampleFormModal onClose={() => setAdding(false)} />}
      {dialog}
    </>
  )
}
