import { useEffect, useState } from 'react'
import { Field, FormError, Select, TextInput, Textarea } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import type { Customer, CustomerType } from '../../db/types'
import { ar } from '../../i18n/ar'
import { saveCustomer } from '../../services/customers'

export function CustomerFormModal({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  customer?: Customer
  onSaved?: (id: string) => void
}) {
  const [form, setForm] = useState({ name: '', phone: '', type: 'individual' as CustomerType, address: '', notes: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({
      name: customer?.name ?? '',
      phone: customer?.phone ?? '',
      type: customer?.type ?? 'individual',
      address: customer?.address ?? '',
      notes: customer?.notes ?? '',
    })
    setError(null)
  }, [open, customer])

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const save = async () => {
    try {
      const id = await saveCustomer(
        db,
        {
          name: form.name,
          phone: form.phone.trim(),
          type: form.type,
          address: form.address.trim() || undefined,
          notes: form.notes.trim() || undefined,
          active: customer?.active ?? true,
        },
        customer?.id,
      )
      onSaved?.(id)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? 'تعديل العميل' : 'عميل جديد'}
      footer={
        <>
          <Button className="flex-1" onClick={save}>حفظ</Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>إلغاء</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="اسم العميل">
          <TextInput value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الهاتف" hint="يُستخدم لإرسال الفواتير عبر واتساب">
            <TextInput value={form.phone} onChange={set('phone')} inputMode="tel" dir="ltr" className="text-end" />
          </Field>
          <Field label="النوع">
            <Select value={form.type} onChange={set('type')}>
              {(Object.keys(ar.customerTypes) as CustomerType[]).map((t) => (
                <option key={t} value={t}>{ar.customerTypes[t]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="العنوان">
          <TextInput value={form.address} onChange={set('address')} />
        </Field>
        <Field label="ملاحظات">
          <Textarea value={form.notes} onChange={set('notes')} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
