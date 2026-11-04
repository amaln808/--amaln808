import { forwardRef } from 'react'
import { formatDate } from '../../components/format'

/** Pixels per millimetre the label is drawn at (≈ 300 dpi when printed). */
export const PX_PER_MM = 12

export interface LabelData {
  batchNo: string
  productionDate: string
  expiryDate: string | null
}

const INK = '#1c1917'

/**
 * A batch sticker for packaging that already carries the product details:
 * batch number, production date and expiry date, Arabic with English beside
 * it. Drawn at the label's real size.
 */
export const BatchLabel = forwardRef<HTMLDivElement, { data: LabelData; w: number; h: number }>(function BatchLabel({ data, w, h }, ref) {
  const mm = (v: number) => v * PX_PER_MM
  const pad = Math.max(1.5, Math.min(w, h) * 0.08)
  // Three lines: as large as the label allows, capped so big labels don't shout
  const base = Math.max(2, Math.min(h * 0.17, w * 0.075, 6))
  const row = (ar: string, en: string, value: string, strong = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: mm(1.5), fontWeight: strong ? 700 : 400, whiteSpace: 'nowrap' }}>
      <span>
        {ar} <span style={{ opacity: 0.65, fontSize: '0.75em', fontWeight: 500 }}>{en}</span>
      </span>
      <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{value}</span>
    </div>
  )

  return (
    <div
      ref={ref}
      dir="rtl"
      lang="ar"
      style={{
        width: mm(w),
        height: mm(h),
        padding: `${mm(pad * 0.6)}px ${mm(pad)}px`,
        boxSizing: 'border-box',
        background: '#fff',
        color: INK,
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        fontSize: mm(base),
        lineHeight: 1.35,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        overflow: 'hidden',
      }}
    >
      {row('رقم الدفعة', 'Batch', data.batchNo, true)}
      {row('الإنتاج', 'Prod', formatDate(data.productionDate))}
      {data.expiryDate && row('الانتهاء', 'Exp', formatDate(data.expiryDate), true)}
    </div>
  )
})
