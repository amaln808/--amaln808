import { forwardRef } from 'react'
import { formatDate } from '../../components/format'
import type { Customer, Item, Settings } from '../../db/types'
import { formatOMR, lineTotal, ltr } from '../../domain/money'
import { formatQty } from '../../domain/quantity'

export interface DocData {
  kind: 'invoice' | 'quote'
  number: string
  date: string
  /** Due date (invoice) or valid-until date (quote) */
  untilDate?: string
  customer?: Customer
  lines: Array<{ itemId: string; qty: number; unitPriceBaisa: number }>
  subtotalBaisa: number
  discountBaisa: number
  vatRatePercent: number
  vatBaisa: number
  totalBaisa: number
  paidBaisa?: number
  notes?: string
}

const TITLES = { invoice: 'فاتورة', quote: 'عرض سعر' }

/**
 * A4-sized (794px wide) printable invoice / quotation. Rendered off-screen and
 * captured to PDF, so it uses fixed pixel sizes rather than responsive classes.
 */
export const SalesDocument = forwardRef<
  HTMLDivElement,
  { doc: DocData; settings: Settings; items: Map<string, Item> }
>(function SalesDocument({ doc, settings, items }, ref) {
  const remaining = doc.totalBaisa - (doc.paidBaisa ?? 0)
  const brand = '#5b4a2f'
  return (
    <div
      ref={ref}
      dir="rtl"
      lang="ar"
      style={{ width: 794, minHeight: 1123, padding: '48px 56px', background: '#fff', color: '#1c1917', fontFamily: "'IBM Plex Sans Arabic', sans-serif", boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${brand}`, paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img src={settings.logoDataUrl || '/logo.png'} alt="" style={{ height: 120, width: 'auto' }} />
          <div>
            <div style={{ fontSize: 30, fontWeight: 700, color: brand }}>{settings.businessName}</div>
            <div style={{ fontSize: 14, color: '#57534e', marginTop: 6, lineHeight: 1.8 }}>
              {settings.businessPhone && <div>هاتف: <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{settings.businessPhone}</span></div>}
              {settings.commercialRegNo && <div>س.ت: {settings.commercialRegNo}</div>}
              {settings.businessAddress && <div>{settings.businessAddress} — سلطنة عُمان</div>}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: brand }}>{TITLES[doc.kind]}</div>
          <table style={{ fontSize: 14, marginTop: 8, borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ color: '#78716c', paddingInlineEnd: 12 }}>الرقم</td>
                <td style={{ fontWeight: 700 }}><span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{doc.number}</span></td>
              </tr>
              <tr>
                <td style={{ color: '#78716c', paddingInlineEnd: 12 }}>التاريخ</td>
                <td>{formatDate(doc.date)}</td>
              </tr>
              {doc.untilDate && (
                <tr>
                  <td style={{ color: '#78716c', paddingInlineEnd: 12 }}>{doc.kind === 'invoice' ? 'تاريخ الاستحقاق' : 'ساري حتى'}</td>
                  <td>{formatDate(doc.untilDate)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer */}
      <div style={{ marginTop: 24, background: '#faf7f2', borderRadius: 12, padding: '14px 18px', fontSize: 15 }}>
        <div style={{ color: '#78716c', fontSize: 13 }}>{doc.kind === 'invoice' ? 'فاتورة إلى' : 'مقدَّم إلى'}</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginTop: 2 }}>{doc.customer?.name ?? '—'}</div>
        {doc.customer?.phone && <div style={{ color: '#57534e' }}>هاتف: <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{doc.customer.phone}</span></div>}
        {doc.customer?.address && <div style={{ color: '#57534e' }}>{doc.customer.address}</div>}
      </div>

      {/* Lines */}
      <table style={{ width: '100%', marginTop: 24, borderCollapse: 'collapse', fontSize: 15 }}>
        <thead>
          <tr style={{ background: brand, color: '#fff' }}>
            {['#', 'الصنف', 'الكمية', 'سعر الوحدة', 'المجموع'].map((h, i) => (
              <th key={h} style={{ padding: '10px 12px', textAlign: i < 2 ? 'right' : 'left', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => {
            const item = items.get(l.itemId)
            return (
              <tr key={i} style={{ borderBottom: '1px solid #e7e5e4' }}>
                <td style={{ padding: '10px 12px', color: '#78716c' }}>{i + 1}</td>
                <td style={{ padding: '10px 12px' }}>{item?.name ?? '—'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'left' }}>{formatQty(l.qty, item?.unit)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'left' }}>{formatOMR(l.unitPriceBaisa)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>{formatOMR(lineTotal(l.qty, l.unitPriceBaisa))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <table style={{ width: 340, fontSize: 15, borderCollapse: 'collapse' }}>
          <tbody>
            <TotalRow label="المجموع" value={formatOMR(doc.subtotalBaisa)} />
            {doc.discountBaisa > 0 && <TotalRow label="الخصم" value={`− ${formatOMR(doc.discountBaisa)}`} />}
            <TotalRow label={`ضريبة القيمة المضافة (${ltr(`${doc.vatRatePercent}%`)})`} value={formatOMR(doc.vatBaisa)} />
            <tr style={{ background: '#f2e6d6' }}>
              <td style={{ padding: '12px', fontWeight: 700, fontSize: 18 }}>الإجمالي</td>
              <td style={{ padding: '12px', fontWeight: 700, fontSize: 18, textAlign: 'left', color: brand }}>{formatOMR(doc.totalBaisa)}</td>
            </tr>
            {doc.kind === 'invoice' && doc.paidBaisa !== undefined && (
              <>
                <TotalRow label="المدفوع" value={formatOMR(doc.paidBaisa)} />
                <TotalRow label="المتبقي" value={formatOMR(remaining)} bold />
              </>
            )}
          </tbody>
        </table>
      </div>

      {doc.notes && (
        <div style={{ marginTop: 24, fontSize: 14, color: '#57534e', whiteSpace: 'pre-line' }}>
          <b>ملاحظات: </b>
          {doc.notes}
        </div>
      )}
      {doc.kind === 'quote' && (
        <div style={{ marginTop: 24, fontSize: 14, color: '#57534e' }}>
          الأسعار بالريال العماني{doc.untilDate ? ` — هذا العرض ساري حتى ${formatDate(doc.untilDate)}` : ''}.
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 32, textAlign: 'center', color: '#78716c', fontSize: 14, borderTop: '1px solid #e7e5e4' }}>
        شكراً لتعاملكم مع {settings.businessName}
      </div>
    </div>
  )
})

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid #e7e5e4' }}>
      <td style={{ padding: '8px 12px', color: bold ? '#1c1917' : '#57534e', fontWeight: bold ? 700 : 400 }}>{label}</td>
      <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: bold ? 700 : 500 }}>{value}</td>
    </tr>
  )
}
