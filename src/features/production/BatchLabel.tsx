import { forwardRef } from 'react'
import { formatDate } from '../../components/format'

/** Pixels per millimetre the label is drawn at (≈ 300 dpi when printed). */
export const PX_PER_MM = 12

export interface LabelData {
  name: string
  nameEn: string | null
  weightG: number | null
  batchNo: string
  productionDate: string
  expiryDate: string | null
  company: string
  companyEn: string | null
  qr: string
}

const INK = '#1c1917'
const BRAND = '#5b4a2f'

/**
 * A product label for a production batch, Arabic with English beside it:
 * name, net weight, batch number, production and expiry dates, and a QR code
 * that opens the batch in the app. Drawn at the label's real size.
 */
export const BatchLabel = forwardRef<HTMLDivElement, { data: LabelData; w: number; h: number }>(function BatchLabel({ data, w, h }, ref) {
  const mm = (v: number) => v * PX_PER_MM
  const pad = Math.max(1.5, Math.min(w, h) * 0.06)
  const qr = Math.min(h - 2 * pad, w * 0.34)
  // Text size from the label's height, kept readable on narrow labels
  const base = Math.max(1.8, Math.min(h * 0.072, w * 0.046))
  // Small labels drop the company line to keep the dates readable
  const showCompany = h >= 38
  const num = (v: string) => <span style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}>{v}</span>
  const row = (ar: string, en: string, value: string, strong = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: mm(1), fontWeight: strong ? 700 : 400, whiteSpace: 'nowrap' }}>
      <span>
        {ar} <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{en}</span>
      </span>
      {num(value)}
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
        padding: mm(pad),
        boxSizing: 'border-box',
        background: '#fff',
        color: INK,
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        fontSize: mm(base),
        lineHeight: 1.3,
        display: 'flex',
        gap: mm(pad),
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.2em', lineHeight: 1.2, color: BRAND }}>{data.name}</div>
          {data.nameEn && (
            <div dir="ltr" style={{ fontSize: '0.85em', textAlign: 'right', opacity: 0.8, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data.nameEn}
            </div>
          )}
        </div>
        <div style={{ borderTop: `${Math.max(1, mm(0.2))}px solid ${BRAND}`, paddingTop: mm(0.6) }}>
          {data.weightG != null && row('الوزن الصافي', 'Net wt', `${data.weightG} g`)}
          {row('رقم الدفعة', 'Batch', data.batchNo, true)}
          {row('الإنتاج', 'Prod', formatDate(data.productionDate))}
          {data.expiryDate && row('الانتهاء', 'Exp', formatDate(data.expiryDate), true)}
        </div>
        {showCompany && (
          <div style={{ fontSize: '0.8em', opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', display: 'flex', gap: '0.4em' }}>
            {[data.company, data.companyEn, 'سلطنة عُمان'].filter(Boolean).map((x, i) => (
              <span key={i} style={{ display: 'flex', gap: '0.4em' }}>
                {i > 0 && <span>·</span>}
                <bdi>{x}</bdi>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img src={data.qr} alt="" style={{ width: mm(qr), height: mm(qr), imageRendering: 'pixelated' }} />
      </div>
    </div>
  )
})
