import { useEffect, useState } from 'react'
import { Field, FormError, TextInput, Textarea } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import type { Supplier } from '../../db/types'
import { saveSupplier } from '../../services/suppliers'

export function SupplierFormModal({
  open,
  onClose,
  supplier,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  supplier?: Supplier
  onSaved?: (id: string) => void
}) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({
      name: supplier?.name ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      address: supplier?.address ?? '',
      notes: supplier?.notes ?? '',
    })
    setError(null)
  }, [open, supplier])

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const save = async () => {
    try {
      const id = await saveSupplier(
        db,
        {
          name: form.name,
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          address: form.address.trim() || undefined,
          notes: form.notes.trim() || undefined,
          active: supplier?.active ?? true,
        },
        supplier?.id,
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
      title={supplier ? 'تعديل المورد' : 'مورد جديد'}
      footer={
        <>
          <Button className="flex-1" onClick={save}>حفظ</Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>إلغاء</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="اسم المورد">
          <TextInput value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الهاتف">
            <TextInput value={form.phone} onChange={set('phone')} inputMode="tel" dir="ltr" className="text-end" />
          </Field>
          <Field label="البريد الإلكتروني">
            <TextInput value={form.email} onChange={set('email')} inputMode="email" dir="ltr" className="text-end" />
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
