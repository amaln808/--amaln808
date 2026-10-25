import { forwardRef, type ReactNode } from 'react'
import { formatDate } from '../../components/format'
import { formatBaisa } from '../../domain/money'
import { formatQty, type Unit } from '../../domain/quantity'
import type { DocLang } from '../../i18n/index'
import { type DocStatus, sealAllowed } from './seal'

export interface DocLine {
  name: string
  nameEn: string | null
  unit: Unit
  qty: number
  unitPriceBaisa: number
  /** Before discount and VAT */
  grossBaisa: number
  /** Batch number and expiry of each lot the line came from (invoices) */
  lots: Array<{ code: string | null; expiry: string | null }>
}

export interface DocData {
  kind: 'invoice' | 'quote'
  status: DocStatus
  number: string
  date: string
  /** Due date (invoice) or valid-until date (quotation) */
  untilDate: string | null
  customer: { name: string; phone: string | null; address: string | null; vatNo: string | null } | null
  lines: DocLine[]
  subtotalBaisa: number
  discountBaisa: number
  vatBaisa: number
  totalBaisa: number
  /** Invoices: amount received so far */
  paidBaisa?: number
  notes: string | null
}

export interface DocCompany {
  name: string
  nameEn: string | null
  phone: string | null
  crNo: string | null
  vatNo: string | null
  address: string | null
  addressEn: string | null
  vatRegistered: boolean
}

export interface DocImages {
  logo: string
  stamp?: string | null
  signature?: string | null
}

const BRAND = '#5b4a2f'
const TINT = '#f6f1e8'
const LINE = '#e7e2d8'
const MUTED = '#78716c'
/** Keeps the items table tall enough that a short document still fills the page neatly. */
const MIN_ROWS = { ar: 8, en: 8, both: 5 }

/**
 * A4 invoice / quotation (794 × 1123 px at 96 dpi), captured to PDF.
 * `lang` is the document's own language — independent of the app's language.
 * The stamp and signature are drawn only when sealAllowed(doc): an issued invoice.
 */
export const SalesDocument = forwardRef<HTMLDivElement, { doc: DocData; company: DocCompany; images: DocImages; lang: DocLang }>(
  function SalesDocument({ doc, company, images, lang }, ref) {
    const rtl = lang !== 'en'
    const start = rtl ? 'right' : 'left'
    const end = rtl ? 'left' : 'right'
    const unitLang = lang === 'en' ? 'en' : 'ar'
    const currency = lang === 'en' ? 'OMR' : lang === 'both' ? 'ر.ع / OMR' : 'ر.ع'
    const isInvoice = doc.kind === 'invoice'
    const seal = sealAllowed(doc)
    const showLots = isInvoice
    const remaining = doc.totalBaisa - (doc.paidBaisa ?? 0)

    /** A label in the document language; in bilingual mode English sits under (or after) the Arabic. */
    const L = (ar: string, en: string, opts: { inline?: boolean } = {}): ReactNode => {
      if (lang === 'ar') return ar
      if (lang === 'en') return en
      return opts.inline ? (
        <>
          {ar}
          <span style={{ opacity: 0.45 }}> / </span>
          <span dir="ltr" style={{ unicodeBidi: 'isolate', opacity: 0.7, fontSize: '0.85em' }}>
            {en}
          </span>
        </>
      ) : (
        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span>{ar}</span>
          <span style={{ fontSize: '0.78em', opacity: 0.8, unicodeBidi: 'isolate' }} dir="ltr">
            {en}
          </span>
        </span>
      )
    }
    const num = (v: string) => <span style={{ direction: 'ltr', unicodeBidi: 'bidi-override', display: 'inline-block' }}>{v}</span>
    const itemName = (l: DocLine): ReactNode => {
      if (lang === 'en') return l.nameEn || l.name
      if (lang === 'both' && l.nameEn)
        return (
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
            <span>{l.name}</span>
            <span dir="ltr" style={{ color: MUTED, fontSize: 12, textAlign: start }}>
              {l.nameEn}
            </span>
          </span>
        )
      return l.name
    }

    const title = isInvoice
      ? company.vatRegistered
        ? L('فاتورة ضريبية', 'TAX INVOICE')
        : L('فاتورة', 'INVOICE')
      : L('عرض سعر', 'QUOTATION')
    const addressAr = company.address ? `${company.address} — سلطنة عُمان` : 'سلطنة عُمان'
    const addressEn = company.addressEn ? `${company.addressEn}, Sultanate of Oman` : 'Sultanate of Oman'
    const filler = Math.max(0, MIN_ROWS[lang] - doc.lines.length)
    const cell = (align: 'start' | 'end' | 'center' = 'start'): React.CSSProperties => ({
      padding: '9px 10px',
      textAlign: align === 'start' ? start : align === 'end' ? end : 'center',
      borderBottom: `1px solid ${LINE}`,
      verticalAlign: 'middle',
    })
    const cols = showLots ? 6 : 5

    return (
      <div
        ref={ref}
        dir={rtl ? 'rtl' : 'ltr'}
        lang={lang === 'en' ? 'en' : 'ar'}
        style={{
          width: 794,
          minHeight: 1123,
          padding: '40px 48px 32px',
          background: '#fff',
          color: '#1c1917',
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          fontSize: 14,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 8, background: BRAND }} />
        {doc.status === 'void' && (
          <div
            style={{
              position: 'absolute',
              top: 420,
              insetInline: 0,
              textAlign: 'center',
              fontSize: 120,
              fontWeight: 700,
              color: 'rgba(185, 28, 28, 0.13)',
              transform: 'rotate(-18deg)',
              pointerEvents: 'none',
            }}
          >
            {lang === 'en' ? 'VOID' : 'ملغاة'}
          </div>
        )}

        {/* Header: logo + document title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <img src={images.logo} alt="" style={{ height: 110, width: 'auto', objectFit: 'contain' }} />
          <div style={{ textAlign: end, minWidth: 260 }}>
            <div style={{ fontSize: 38, fontWeight: 700, color: BRAND, letterSpacing: lang === 'en' ? 2 : 0, lineHeight: 1.1 }}>{title}</div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>{num(doc.number)}</div>
          </div>
        </div>

        {/* Business contact strip */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `2px solid ${BRAND}`, display: 'flex', flexWrap: 'wrap', gap: '4px 24px', color: '#44403c', fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>{lang === 'en' ? company.nameEn || company.name : company.name}</span>
          {company.phone && (
            <span>
              {lang === 'en' ? 'Tel' : 'هاتف'}: {num(company.phone)}
            </span>
          )}
          {company.crNo && (
            <span>
              {lang === 'en' ? 'CR' : 'س.ت'}: {num(company.crNo)}
            </span>
          )}
          {company.vatRegistered && company.vatNo && (
            <span>
              {lang === 'en' ? 'VAT no.' : 'الرقم الضريبي'}: {num(company.vatNo)}
            </span>
          )}
          <span>
            {lang === 'en' ? addressEn : lang === 'both' ? (
              <>
                {addressAr}{' '}
                <span style={{ color: MUTED, unicodeBidi: 'isolate' }} dir="ltr">
                  · {addressEn}
                </span>
              </>
            ) : (
              addressAr
            )}
          </span>
        </div>

        {/* Customer + details */}
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
          <div style={{ background: TINT, borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ color: MUTED, fontSize: 12, marginBottom: 4 }}>
              {isInvoice ? L('فاتورة إلى', 'Bill to', { inline: true }) : L('مقدَّم إلى', 'Prepared for', { inline: true })}
            </div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{doc.customer?.name ?? '—'}</div>
            {doc.customer?.phone && <div style={{ color: '#44403c', marginTop: 2 }}>{num(doc.customer.phone)}</div>}
            {doc.customer?.address && <div style={{ color: '#44403c' }}>{doc.customer.address}</div>}
            {doc.customer?.vatNo && (
              <div style={{ color: '#44403c' }}>
                {lang === 'en' ? 'VAT no.' : 'الرقم الضريبي'}: {num(doc.customer.vatNo)}
              </div>
            )}
          </div>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 18px' }}>
            {[
              [L('رقم المستند', 'Document no.', { inline: true }), num(doc.number)],
              [L('التاريخ', 'Date', { inline: true }), num(formatDate(doc.date))],
              ...(doc.untilDate
                ? [[isInvoice ? L('تاريخ الاستحقاق', 'Due date', { inline: true }) : L('ساري حتى', 'Valid until', { inline: true }), num(formatDate(doc.untilDate))]]
                : []),
            ].map(([k, v], i, all) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: i < all.length - 1 ? `1px dashed ${LINE}` : undefined }}>
                <span style={{ color: MUTED }}>{k}</span>
                <span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Items */}
        <table style={{ width: '100%', marginTop: 20, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: BRAND, color: '#fff' }}>
              <th style={{ ...cell('center'), width: 34, borderBottom: 'none', fontWeight: 500 }}>#</th>
              <th style={{ ...cell('start'), borderBottom: 'none', fontWeight: 500 }}>{L('الصنف', 'Item')}</th>
              {showLots && <th style={{ ...cell('center'), width: 140, borderBottom: 'none', fontWeight: 500 }}>{L('الدفعة / الانتهاء', 'Batch / expiry')}</th>}
              <th style={{ ...cell('center'), width: 80, borderBottom: 'none', fontWeight: 500 }}>{L('الكمية', 'Qty')}</th>
              <th style={{ ...cell('end'), width: 105, borderBottom: 'none', fontWeight: 500 }}>{L('سعر الوحدة', 'Unit price')}</th>
              <th style={{ ...cell('end'), width: 115, borderBottom: 'none', fontWeight: 500 }}>{L('المبلغ', 'Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i} style={{ background: i % 2 ? TINT : '#fff' }}>
                <td style={{ ...cell('center'), color: MUTED }}>{i + 1}</td>
                <td style={cell('start')}>{itemName(l)}</td>
                {showLots && (
                  <td style={{ ...cell('center'), fontSize: 12 }}>
                    {l.lots.length
                      ? l.lots.map((lot, j) => (
                          <div key={j} style={{ lineHeight: 1.4 }}>
                            {num(lot.code ?? '—')}
                            {lot.expiry && <span style={{ color: MUTED }}> · {num(formatDate(lot.expiry))}</span>}
                          </div>
                        ))
                      : '—'}
                  </td>
                )}
                <td style={cell('center')}>{num(formatQty(l.qty, l.unit, unitLang))}</td>
                <td style={cell('end')}>{num(formatBaisa(l.unitPriceBaisa))}</td>
                <td style={{ ...cell('end'), fontWeight: 700 }}>{num(formatBaisa(l.grossBaisa))}</td>
              </tr>
            ))}
            {Array.from({ length: filler }, (_, i) => (
              <tr key={`f${i}`} style={{ background: (doc.lines.length + i) % 2 ? TINT : '#fff' }}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} style={{ ...cell(), height: 22 }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 6, color: MUTED, fontSize: 12, textAlign: end }}>{L('المبالغ بالريال العماني', 'Amounts in Omani rials (OMR)', { inline: true })}</div>

        {/* Notes + totals */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: lang === 'both' ? '1fr 360px' : '1fr 320px', gap: 20, alignItems: 'start' }}>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 16px', minHeight: 96, fontSize: 13, color: '#44403c' }}>
            <div style={{ fontWeight: 700, color: BRAND, marginBottom: 4 }}>{L('ملاحظات', 'Notes', { inline: true })}</div>
            {doc.notes && <div style={{ whiteSpace: 'pre-line', marginBottom: 6 }}>{doc.notes}</div>}
            {doc.untilDate &&
              (isInvoice ? (
                <div>{L(`يُرجى السداد قبل ${formatDate(doc.untilDate)}.`, `Please pay by ${formatDate(doc.untilDate)}.`)}</div>
              ) : (
                <div>{L(`هذا العرض ساري حتى ${formatDate(doc.untilDate)}.`, `This quotation is valid until ${formatDate(doc.untilDate)}.`)}</div>
              ))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              <TotalRow label={L('المجموع', 'Subtotal', { inline: true })} value={num(formatBaisa(doc.subtotalBaisa))} start={start} end={end} />
              {doc.discountBaisa > 0 && <TotalRow label={L('الخصم', 'Discount', { inline: true })} value={num(`− ${formatBaisa(doc.discountBaisa)}`)} start={start} end={end} />}
              {company.vatRegistered && <TotalRow label={L('ضريبة القيمة المضافة', 'VAT', { inline: true })} value={num(formatBaisa(doc.vatBaisa))} start={start} end={end} />}
              <tr style={{ background: BRAND, color: '#fff' }}>
                <td style={{ padding: '12px', fontWeight: 700, fontSize: 16, textAlign: start }}>{L('الإجمالي', 'Total', { inline: true })}</td>
                <td style={{ padding: '12px', fontWeight: 700, fontSize: 18, textAlign: end, whiteSpace: 'nowrap' }}>
                  {num(formatBaisa(doc.totalBaisa))} <span style={{ fontSize: 12, fontWeight: 500 }}>{currency}</span>
                </td>
              </tr>
              {isInvoice && doc.status === 'issued' && doc.paidBaisa !== undefined && doc.paidBaisa > 0 && (
                <>
                  <TotalRow label={L('المدفوع', 'Paid', { inline: true })} value={num(formatBaisa(doc.paidBaisa))} start={start} end={end} />
                  <TotalRow label={L('المتبقي', 'Balance due', { inline: true })} value={num(formatBaisa(remaining))} start={start} end={end} bold />
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Signature & stamp — issued invoices only, pushed to the bottom of the page */}
        {seal && (
          <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, paddingTop: 24 }}>
            {[
              { label: L('التوقيع', 'Signature', { inline: true }), src: images.signature },
              { label: L('الختم', 'Stamp', { inline: true }), src: images.stamp },
            ].map(({ label, src }, i) => (
              <div key={i}>
                <div style={{ height: 96, borderBottom: '1px solid #a8a29e', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {src && <img src={src} alt="" data-seal={i === 0 ? 'signature' : 'stamp'} style={{ maxHeight: 92, maxWidth: '80%', objectFit: 'contain' }} />}
                </div>
                <div style={{ marginTop: 6, color: MUTED, fontSize: 12, textAlign: 'center' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: seal ? 20 : 'auto', padding: '10px 16px', background: TINT, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#44403c' }}>
          <span style={{ fontWeight: 700, color: BRAND }}>{L('شكراً لتعاملكم معنا', 'Thank you for your business', { inline: true })}</span>
          <span>
            {company.phone && num(company.phone)}
            {company.crNo && (
              <>
                {' '}
                · {lang === 'en' ? 'CR' : 'س.ت'} {num(company.crNo)}
              </>
            )}
          </span>
        </div>
      </div>
    )
  },
)

function TotalRow({ label, value, bold, start, end }: { label: ReactNode; value: ReactNode; bold?: boolean; start: string; end: string }) {
  return (
    <tr style={{ borderBottom: `1px solid ${LINE}` }}>
      <td style={{ padding: '8px 12px', color: bold ? '#1c1917' : '#57534e', fontWeight: bold ? 700 : 400, textAlign: start as 'left', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '8px 12px', textAlign: end as 'left', fontWeight: bold ? 700 : 500, whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )
}
