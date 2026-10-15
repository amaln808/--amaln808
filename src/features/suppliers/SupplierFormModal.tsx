import { t } from '../../i18n/index'
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
      title={supplier ? t("تعديل المورد", "Edit supplier") : t("مورد جديد", "New supplier")}
      footer={
        <>
          <Button className="flex-1" onClick={save}>{t("حفظ", "Save")}</Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t("إلغاء", "Cancel")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("اسم المورد", "Supplier name")}>
          <TextInput value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("الهاتف", "Phone")}>
            <TextInput value={form.phone} onChange={set('phone')} inputMode="tel" dir="ltr" className="rtl:text-right" />
          </Field>
          <Field label={t("البريد الإلكتروني", "Email")}>
            <TextInput value={form.email} onChange={set('email')} inputMode="email" dir="ltr" className="rtl:text-right" />
          </Field>
        </div>
        <Field label={t("العنوان", "Address")}>
          <TextInput value={form.address} onChange={set('address')} />
        </Field>
        <Field label={t("ملاحظات", "Notes")}>
          <Textarea value={form.notes} onChange={set('notes')} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
