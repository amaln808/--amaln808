import { useState } from 'react'
import { Field, FormError, Select, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { serverError } from '../../data/errors'
import { saveSupplier, type Supplier, type SupplierDraft } from '../../data/inventory'
import { t } from '../../i18n/index'
import { supplierKindLabel } from '../inventory/labels'

export function SupplierFormModal({ supplier, onClose }: { supplier?: Supplier; onClose: (savedId?: string) => void }) {
  const [f, setF] = useState<SupplierDraft>(
    supplier ?? { name: '', phone: null, email: null, address: null, vatNo: null, kind: 'materials', notes: null, active: true },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof SupplierDraft>(k: K, v: SupplierDraft[K]) => setF((x) => ({ ...x, [k]: v }))
  const clean = (v: string | null) => v?.trim() || null

  const save = async (patch: Partial<SupplierDraft> = {}) => {
    if (!f.name.trim()) return setError(t('اسم المورد مطلوب.', 'The supplier name is required.'))
    setBusy(true)
    setError(null)
    try {
      const id = await saveSupplier({
        ...f,
        name: f.name.trim(),
        phone: clean(f.phone),
        email: clean(f.email),
        address: clean(f.address),
        vatNo: clean(f.vatNo),
        notes: clean(f.notes),
        ...patch,
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
      title={supplier ? t('تعديل المورد', 'Edit supplier') : t('مورد جديد', 'New supplier')}
      footer={
        <>
          <Button onClick={() => save()} disabled={busy} className="flex-1">
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {supplier && (
            <Button variant="secondary" disabled={busy} onClick={() => save({ active: !supplier.active })}>
              {supplier.active ? t('إيقاف', 'Deactivate') : t('إعادة تفعيل', 'Reactivate')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('الاسم', 'Name')} className="sm:col-span-2">
          <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={t('الهاتف', 'Phone')}>
          <TextInput dir="ltr" inputMode="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t('النوع', 'Kind')}>
          <Select value={f.kind} onChange={(e) => set('kind', e.target.value as Supplier['kind'])}>
            {(['materials', 'expenses', 'both'] as const).map((k) => (
              <option key={k} value={k}>
                {supplierKindLabel(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('البريد الإلكتروني', 'Email')}>
          <TextInput dir="ltr" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t('الرقم الضريبي', 'VAT number')}>
          <TextInput dir="ltr" value={f.vatNo ?? ''} onChange={(e) => set('vatNo', e.target.value)} />
        </Field>
        <Field label={t('العنوان', 'Address')} className="sm:col-span-2">
          <TextInput value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2">
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
