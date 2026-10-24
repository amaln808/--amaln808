import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import { Field, FormError, NumberInput, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { serverError } from '../../data/errors'
import { compressImage, removeFile, uploadFile } from '../../data/files'
import { type Item, type ItemDraft, saveItem } from '../../data/inventory'
import { useSignedUrl } from '../../data/useSignedUrl'
import { parseQty } from '../../domain/quantity'
import { t } from '../../i18n/index'

/** Add or edit a finished product, with a photo straight from the camera. */
export function ProductFormModal({ product, onClose }: { product?: Item; onClose: (savedId?: string) => void }) {
  const [f, setF] = useState<ItemDraft>(
    product ?? {
      type: 'finished',
      name: '',
      nameEn: null,
      unit: 'piece',
      sku: null,
      minQty: 0,
      requiresExpiry: false,
      description: null,
      weightG: null,
      photoPath: null,
      shelfLifeDays: 180,
      vatRate: null,
      active: true,
    },
  )
  const [weight, setWeight] = useState(product?.weightG ? String(product.weightG) : '')
  const [shelf, setShelf] = useState(f.shelfLifeDays ? String(f.shelfLifeDays) : '')
  const [minQty, setMinQty] = useState(product ? String(product.minQty) : '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const current = useSignedUrl('products', product?.photoPath)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setF((x) => ({ ...x, [k]: v }))

  const pick = (file: File | undefined) => {
    if (!file) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  const save = async () => {
    const w = weight.trim() ? parseQty(weight) : null
    const s = shelf.trim() ? Number(parseQty(shelf)) : null
    const m = minQty.trim() ? parseQty(minQty) : 0
    if (!f.name.trim()) return setError(t('اسم المنتج مطلوب.', 'The product name is required.'))
    if (weight.trim() && !w) return setError(t('الوزن غير صحيح.', 'Invalid weight.'))
    if (shelf.trim() && (!s || !Number.isInteger(s))) return setError(t('مدة الصلاحية بالأيام (رقم صحيح).', 'Shelf life is a whole number of days.'))
    if (m === null) return setError(t('الحد الأدنى غير صحيح.', 'Invalid minimum.'))
    setBusy(true)
    setError(null)
    try {
      let photoPath = f.photoPath
      if (photo) {
        photoPath = await uploadFile('products', `${crypto.randomUUID()}.jpg`, await compressImage(photo, { maxDim: 1200 }))
        if (f.photoPath) removeFile('products', f.photoPath).catch(() => {})
      }
      const id = await saveItem({
        ...f,
        name: f.name.trim(),
        nameEn: f.nameEn?.trim() || null,
        description: f.description?.trim() || null,
        weightG: w,
        shelfLifeDays: s,
        minQty: m,
        photoPath,
      })
      onClose(id)
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  const shown = preview ?? current
  return (
    <Modal
      open
      onClose={() => onClose()}
      title={product ? t('تعديل المنتج', 'Edit product') : t('منتج جديد', 'New product')}
      footer={
        <>
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {product && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                await saveItem({ ...product, active: !product.active })
                onClose(product.id)
              }}
            >
              {product.active ? t('إيقاف', 'Deactivate') : t('إعادة تفعيل', 'Reactivate')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => camera.current?.click()}
            className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line bg-brand-50 text-brand-800"
            aria-label={t('تصوير المنتج', 'Take a photo')}
          >
            {shown ? <img src={shown} alt="" className="size-full object-cover" /> : <Camera className="size-8" />}
          </button>
          <div className="text-sm text-muted">
            {t('بالضغط على المربع يمكن تصوير المنتج أو اختيار صورة.', 'Tap the square to take a photo or pick one.')}
          </div>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('الاسم', 'Name')} className="sm:col-span-2">
            <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={t('مثال: معجون تمر بزبدة الفول السوداني 250 جم', 'e.g. Date & peanut paste 250 g')} />
          </Field>
          <Field label={t('الاسم بالإنجليزية', 'English name')} className="sm:col-span-2">
            <TextInput dir="ltr" value={f.nameEn ?? ''} onChange={(e) => set('nameEn', e.target.value)} />
          </Field>
          <Field label={t('الوزن', 'Weight')}>
            <NumberInput value={weight} onChange={(e) => setWeight(e.target.value)} suffix={t('جم', 'g')} />
          </Field>
          <Field label={t('مدة الصلاحية', 'Shelf life')} hint={t('تُقترح منها تواريخ انتهاء الدفعات.', 'Used to suggest batch expiry dates.')}>
            <NumberInput value={shelf} onChange={(e) => setShelf(e.target.value)} suffix={t('يوم', 'days')} />
          </Field>
          <Field label={t('الحد الأدنى للتنبيه', 'Alert below')}>
            <NumberInput value={minQty} onChange={(e) => setMinQty(e.target.value)} suffix={t('عبوة', 'jars')} />
          </Field>
          <Field label={t('الوصف', 'Description')} className="sm:col-span-2">
            <Textarea value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
