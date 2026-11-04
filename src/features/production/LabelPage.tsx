import { Download, Loader2, Printer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Field, FormError, NumberInput, Segmented } from '../../components/form'
import { Button, Card, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchBatchDetail } from '../../data/production'
import { useQuery } from '../../data/useQuery'
import { A4, placeLabels, sheetGrid } from '../../domain/labels'
import { parseQty } from '../../domain/quantity'
import { t } from '../../i18n/index'
import { downloadBlob } from '../documents/pdf'
import { shareOrDownload } from '../documents/share'
import { BatchLabel, type LabelData } from './BatchLabel'

type Layout = 'roll' | 'sheet'
const SIZES = ['40x20', '50x25', '50x30', '60x40', 'custom'] as const
type SizeKey = (typeof SIZES)[number]
const PREFS = 'zawrda-label'

function loadPrefs(): { size: SizeKey; w: string; h: string; layout: Layout } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? 'null')
    if (p && SIZES.includes(p.size)) return p
  } catch {
    /* no saved choice */
  }
  return { size: '40x20', w: '40', h: '20', layout: 'roll' }
}

/** Labels for a production batch, as a PDF at the real label size to print from the iPad. */
export function LabelPage() {
  const { id = '' } = useParams()
  const q = useQuery(`batch:${id}`, () => fetchBatchDetail(id))
  const [prefs, setPrefs] = useState(loadPrefs)
  const [copies, setCopies] = useState('')
  const [pdf, setPdf] = useState<{ blob: Blob; preview: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const save = (p: typeof prefs) => {
    setPrefs(p)
    try {
      localStorage.setItem(PREFS, JSON.stringify(p))
    } catch {
      /* private mode */
    }
  }
  const [w, h] = prefs.size === 'custom' ? [parseQty(prefs.w) ?? 0, parseQty(prefs.h) ?? 0] : prefs.size.split('x').map(Number)
  const sizeOk = w >= 25 && h >= 15 && w <= 200 && h <= 150
  const grid = sheetGrid(w, h)
  const layout: Layout = prefs.layout === 'sheet' && grid.perPage ? 'sheet' : 'roll'
  const n = copies.trim() ? (parseQty(copies) ?? 0) : layout === 'sheet' ? grid.perPage : 1
  const count = Math.min(Math.floor(n), 2000)

  const batch = q.data?.batch
  const data: LabelData | null = batch ? { batchNo: batch.batchNo, productionDate: batch.productionDate, expiryDate: batch.expiryDate } : null
  const key = JSON.stringify({ data, w, h, layout, count })

  useEffect(() => {
    if (!data || !sizeOk || count < 1) return
    let cancelled = false
    setPdf(null)
    const timer = setTimeout(async () => {
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
        await document.fonts.ready
        if (!ref.current || cancelled) return
        const canvas = await html2canvas(ref.current, { scale: 1, backgroundColor: '#ffffff', logging: false })
        const png = canvas.toDataURL('image/png')
        const roll = layout === 'roll'
        const doc = new jsPDF({ unit: 'mm', format: roll ? [w, h] : [A4.w, A4.h], orientation: roll && w > h ? 'landscape' : 'portrait', compress: true })
        let page = 0
        for (const p of placeLabels(w, h, count, layout)) {
          if (p.page !== page) {
            doc.addPage(roll ? [w, h] : [A4.w, A4.h], roll && w > h ? 'landscape' : 'portrait')
            page = p.page
          }
          doc.addImage(png, 'PNG', p.x, p.y, w, h, 'label')
          if (!roll) {
            // Faint cutting guide
            doc.setDrawColor(220)
            doc.setLineWidth(0.1)
            doc.rect(p.x, p.y, w, h)
          }
        }
        if (!cancelled) setPdf({ blob: doc.output('blob'), preview: png })
      } catch (e) {
        console.error(e)
        if (!cancelled) setError(t('تعذر إنشاء ملف الملصقات.', "Couldn't create the labels file."))
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key])

  const back = { to: `/production/${id}`, label: t('الدفعة', 'Batch') }
  if (!batch) {
    return (
      <>
        <PageHeader title={t('ملصق الدفعة', 'Batch label')} back={back} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }
  const filename = `${batch.batchNo} ${t('ملصقات', 'labels')}.pdf`
  const pages = layout === 'sheet' ? Math.ceil(count / grid.perPage) : count

  return (
    <>
      <PageHeader
        title={t(`ملصق الدفعة ${batch.batchNo}`, `Label for batch ${batch.batchNo}`)}
        subtitle={t('رقم الدفعة وتاريخا الإنتاج والانتهاء، لعبوات مطبوع عليها باقي بيانات المنتج.', 'Batch number, production and expiry dates, for packaging that already carries the product details.')}
        back={back}
      />
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <Field label={t('مقاس الملصق (ملم)', 'Label size (mm)')}>
            <Segmented<SizeKey>
              value={prefs.size}
              onChange={(size) => save({ ...prefs, size })}
              options={SIZES.map((s) => ({ value: s, label: s === 'custom' ? t('مقاس آخر', 'Other') : s.replace('x', ' × ') }))}
            />
          </Field>
          {prefs.size === 'custom' && (
            <div className="grid max-w-md grid-cols-2 gap-3">
              <Field label={t('العرض', 'Width')}>
                <NumberInput value={prefs.w} onChange={(e) => save({ ...prefs, w: e.target.value })} suffix={t('ملم', 'mm')} />
              </Field>
              <Field label={t('الارتفاع', 'Height')}>
                <NumberInput value={prefs.h} onChange={(e) => save({ ...prefs, h: e.target.value })} suffix={t('ملم', 'mm')} />
              </Field>
            </div>
          )}
          {!sizeOk && <p className="text-sm text-red-700">{t('المقاس بين 25×15 و200×150 ملم.', 'Size between 25×15 and 200×150 mm.')}</p>}
          <Field
            label={t('الطباعة على', 'Print on')}
            hint={
              layout === 'sheet'
                ? t(`${grid.perPage} ملصقاً في كل ورقة A4 (${grid.cols} × ${grid.rows})`, `${grid.perPage} labels per A4 sheet (${grid.cols} × ${grid.rows})`)
                : t('صفحة لكل ملصق بمقاسه — لطابعة الملصقات', 'One page per label at its size — for a label printer')
            }
          >
            <Segmented<Layout>
              value={layout}
              onChange={(l) => save({ ...prefs, layout: l })}
              options={[
                { value: 'roll', label: t('طابعة ملصقات', 'Label printer') },
                { value: 'sheet', label: t('ورق ملصقات A4', 'A4 label sheets') },
              ]}
            />
          </Field>
          <div className="max-w-xs">
            <Field label={t('عدد الملصقات', 'Number of labels')} hint={t(`الدفعة ${batch.qtyProduced} عبوة`, `The batch is ${batch.qtyProduced} jars`)}>
              <NumberInput value={copies} onChange={(e) => setCopies(e.target.value)} placeholder={String(layout === 'sheet' ? grid.perPage : 1)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => pdf && shareOrDownload(pdf.blob, filename, 'application/pdf')} disabled={!pdf}>
              {pdf ? <Printer className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
              {t('طباعة / مشاركة', 'Print / share')}
            </Button>
            <Button variant="secondary" onClick={() => pdf && downloadBlob(pdf.blob, filename)} disabled={!pdf}>
              <Download className="size-5" /> {t('تنزيل PDF', 'Download PDF')}
            </Button>
          </div>
          {count > 0 && sizeOk && (
            <p className="text-sm text-muted">
              {t(`${count} ملصق في ${pages} صفحة.`, `${count} labels on ${pages} pages.`)}{' '}
              {t('في الآيباد: «طباعة / مشاركة» ← «طباعة»، واختيار المقاس الفعلي (100%) دون تكبير.', 'On iPad: Print / share → Print, at actual size (100%).')}
            </p>
          )}
          <FormError message={error} />
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">{t('المعاينة', 'Preview')}</h2>
          <div className="flex justify-center rounded-xl bg-stone-100 p-6">
            {pdf ? (
              <img src={pdf.preview} alt={t('معاينة الملصق', 'Label preview')} className="border border-line bg-white shadow-sm" style={{ width: `min(100%, ${w * 6}px)` }} />
            ) : (
              <Loader2 className="size-8 animate-spin text-stone-400" />
            )}
          </div>
        </Card>
      </div>
      {data && sizeOk && (
        <div aria-hidden style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }}>
          <BatchLabel ref={ref} data={data} w={w} h={h} />
        </div>
      )}
    </>
  )
}
