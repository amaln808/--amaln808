import { useState } from 'react'
import { Combobox, Field, FormError, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { serverError } from '../../data/errors'
import { type Channel, type Customer, saveCustomer } from '../../data/sales'
import { t } from '../../i18n/index'

/** New or edited customer. The channel is typed or picked; a new name becomes a new channel with its own price list. */
export function CustomerFormModal({
  customer,
  channels,
  onClose,
}: {
  customer?: Customer
  channels: Channel[]
  onClose: (savedId?: string) => void
}) {
  const [f, setF] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    vatNo: customer?.vatNo ?? '',
    notes: customer?.notes ?? '',
    channelName: channels.find((c) => c.id === customer?.channelId)?.name ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const clean = (v: string) => v.trim() || null

  const save = async (active = customer?.active ?? true) => {
    if (!f.name.trim()) return setError(t('اسم العميل مطلوب.', 'The customer name is required.'))
    setBusy(true)
    setError(null)
    try {
      const id = await saveCustomer({
        id: customer?.id,
        name: f.name.trim(),
        phone: clean(f.phone),
        email: clean(f.email),
        address: clean(f.address),
        vatNo: clean(f.vatNo),
        notes: clean(f.notes),
        channelName: f.channelName,
        active,
      })
      onClose(id)
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => onClose()}
      title={customer ? t('تعديل العميل', 'Edit customer') : t('عميل جديد', 'New customer')}
      footer={
        <>
          <Button onClick={() => save()} disabled={busy} className="flex-1">
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {customer && (
            <Button variant="secondary" disabled={busy} onClick={() => save(!customer.active)}>
              {customer.active ? t('إيقاف', 'Deactivate') : t('إعادة تفعيل', 'Reactivate')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('الاسم', 'Name')} className="sm:col-span-2">
          <TextInput value={f.name} onChange={set('name')} />
        </Field>
        <Field label={t('الهاتف', 'Phone')} hint={t('لإرسال الفواتير عبر واتساب', 'To send invoices by WhatsApp')}>
          <TextInput dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label={t('القناة', 'Channel')} hint={t('تحدد قائمة الأسعار؛ اكتب قناة جديدة أو اختر', 'Sets the price list; type a new one or pick')}>
          <Combobox
            value={f.channelName}
            onChange={(v) => setF((x) => ({ ...x, channelName: v }))}
            options={channels.filter((c) => c.active).map((c) => ({ label: c.name }))}
            newLabel={t('جديدة', 'New')}
          />
        </Field>
        <Field label={t('البريد الإلكتروني', 'Email')}>
          <TextInput dir="ltr" type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label={t('الرقم الضريبي', 'VAT number')}>
          <TextInput dir="ltr" value={f.vatNo} onChange={set('vatNo')} />
        </Field>
        <Field label={t('العنوان', 'Address')} className="sm:col-span-2">
          <TextInput value={f.address} onChange={set('address')} />
        </Field>
        <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2">
          <Textarea value={f.notes} onChange={set('notes')} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
