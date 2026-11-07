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
  /** Quotations: the price of each line for each way of paying, with the total */
  options?: Array<{ ar: string; en: string; prices: number[]; totalBaisa: number }>
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
const MUTED = '#666'
/** Table rules and the header shading of a plain word-processor table */
const GRID = '#9a9a9a'
const HEAD = '#f0f0f0'

/**
 * A4 invoice / quotation (794 × 1123 px at 96 dpi), captured to PDF. Laid out like a
 * typed page: letterhead with the business details stacked on the left (in Arabic),
 * a centred title, plain bordered tables, and the totals low on the page.
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
      : L('عرض أسعار', 'QUOTATION')
    const options = !isInvoice && doc.options?.length ? doc.options : null
    const border = `1px solid ${GRID}`
    const cell = (align: 'start' | 'end' | 'center' = 'start'): React.CSSProperties => ({
      padding: '7px 9px',
      textAlign: align === 'start' ? start : align === 'end' ? end : 'center',
      border,
      verticalAlign: 'middle',
    })
    const th = (align: 'start' | 'end' | 'center', width?: number): React.CSSProperties => ({ ...cell(align), width, background: HEAD, fontWeight: 700 })
    // Company details, one under another, on the left of the page (the right in English)
    const companyLines: ReactNode[] = [
      <span key="n" style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{lang === 'en' ? company.nameEn || company.name : company.name}</span>,
      ...(lang === 'both' && company.nameEn ? [<span key="ne" dir="ltr">{company.nameEn}</span>] : []),
      ...(company.crNo ? [<span key="cr">{L('السجل التجاري', 'CR no.', { inline: true })}: {num(company.crNo)}</span>] : []),
      ...(company.vatRegistered && company.vatNo ? [<span key="vat">{L('الرقم الضريبي', 'VAT no.', { inline: true })}: {num(company.vatNo)}</span>] : []),
      ...(company.phone ? [<span key="ph">{L('هاتف', 'Tel', { inline: true })}: {num(company.phone)}</span>] : []),
      ...(lang !== 'en' ? [<span key="a">{company.address ? `${company.address} — سلطنة عُمان` : 'سلطنة عُمان'}</span>] : []),
      ...(lang !== 'ar' ? [<span key="ae" dir="ltr">{company.addressEn ? `${company.addressEn}, Sultanate of Oman` : 'Sultanate of Oman'}</span>] : []),
    ]

    return (
      <div
        ref={ref}
        dir={rtl ? 'rtl' : 'ltr'}
        lang={lang === 'en' ? 'en' : 'ar'}
        style={{
          width: 794,
          minHeight: 1123,
          padding: '48px 60px 36px',
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

        {/* Letterhead: logo on one side, the business details stacked on the other */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <img src={images.logo} alt="" style={{ height: 92, width: 'auto', objectFit: 'contain' }} />
            <div dir="ltr" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 3, color: BRAND }}>Zuwardah</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: end, gap: 2, fontSize: 13, color: '#333', lineHeight: 1.5 }}>
            {companyLines}
          </div>
        </div>
        <div style={{ marginTop: 14, borderTop: `1.5px solid #333` }} />

        {/* Title, centred */}
        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: lang === 'en' ? 3 : 0, color: '#111', textDecoration: 'underline', textUnderlineOffset: 8, textDecorationThickness: 1.5 }}>{title}</div>
        </div>

        {/* Customer and document details, plain text as on a typed page */}
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', gap: 24, lineHeight: 1.7 }}>
          <div>
            <div style={{ color: MUTED, fontSize: 13 }}>{isInvoice ? L('فاتورة إلى', 'Bill to', { inline: true }) : L('مقدَّم إلى', 'Prepared for', { inline: true })}:</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{doc.customer?.name ?? '—'}</div>
            {doc.customer?.phone && <div>{num(doc.customer.phone)}</div>}
            {doc.customer?.address && <div>{doc.customer.address}</div>}
            {doc.customer?.vatNo && (
              <div>
                {lang === 'en' ? 'VAT no.' : 'الرقم الضريبي'}: {num(doc.customer.vatNo)}
              </div>
            )}
          </div>
          <table style={{ borderCollapse: 'collapse', alignSelf: 'flex-start', fontSize: 13.5 }}>
            <tbody>
              {[
                [L('رقم المستند', 'Document no.', { inline: true }), num(doc.number)],
                [L('التاريخ', 'Date', { inline: true }), num(formatDate(doc.date))],
                ...(doc.untilDate
                  ? [[isInvoice ? L('تاريخ الاستحقاق', 'Due date', { inline: true }) : L('ساري حتى', 'Valid until', { inline: true }), num(formatDate(doc.untilDate))]]
                  : []),
              ].map(([k, v], i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 0', paddingInlineEnd: 14, color: MUTED, textAlign: start }}>{k}:</td>
                  <td style={{ padding: '2px 0', fontWeight: 700, textAlign: start }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Items: a plain bordered table */}
        <table style={{ width: '100%', marginTop: 22, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={th('center', 34)}>#</th>
              <th style={th('start')}>{L('الصنف', 'Item')}</th>
              {showLots && <th style={th('center', 140)}>{L('الدفعة / الانتهاء', 'Batch / expiry')}</th>}
              <th style={th('center', 80)}>{L('الكمية', 'Qty')}</th>
              <th style={th('end', 105)}>{L('سعر الوحدة', 'Unit price')}</th>
              <th style={th('end', 115)}>{L('المبلغ', 'Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i}>
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
                <td style={cell('center')}>
                  <span style={{ unicodeBidi: 'isolate', direction: unitLang === 'en' ? 'ltr' : 'rtl', display: 'inline-block' }}>{formatQty(l.qty, l.unit, unitLang)}</span>
                </td>
                <td style={cell('end')}>{num(formatBaisa(l.unitPriceBaisa))}</td>
                <td style={{ ...cell('end'), fontWeight: 700 }}>{num(formatBaisa(l.grossBaisa))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 5, color: MUTED, fontSize: 12, textAlign: end }}>{L('المبالغ بالريال العماني', 'Amounts in Omani rials (OMR)', { inline: true })}</div>

        {/* Quotation: price per way of paying */}
        {options && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>{L('خيارات الأسعار حسب طريقة الدفع', 'Prices by payment option', { inline: true })}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th('start')}>{L('الصنف (سعر الوحدة)', 'Item (unit price)')}</th>
                  {options.map((o, i) => (
                    <th key={i} style={th('center', 120)}>
                      {L(o.ar, o.en)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((l, i) => (
                  <tr key={i}>
                    <td style={cell('start')}>{itemName(l)}</td>
                    {options.map((o, j) => (
                      <td key={j} style={cell('center')}>
                        {num(formatBaisa(o.prices[i]))}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td style={cell('start')}>{company.vatRegistered ? L('الإجمالي قبل الضريبة', 'Total before VAT') : L('الإجمالي', 'Total')}</td>
                  {options.map((o, j) => (
                    <td key={j} style={cell('center')}>
                      {num(formatBaisa(o.totalBaisa))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Blank space, so the totals sit low on the page as on a printed A4 sheet */}
        <div style={{ flex: 1, minHeight: 48 }} />

        {/* Notes + totals */}
        <div style={{ display: 'grid', gridTemplateColumns: lang === 'both' ? '1fr 340px' : '1fr 300px', gap: 28, alignItems: 'start' }}>
          <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>
            {(doc.notes || doc.untilDate) && <div style={{ fontWeight: 700, marginBottom: 2 }}>{L('ملاحظات', 'Notes', { inline: true })}:</div>}
            {doc.notes && <div style={{ whiteSpace: 'pre-line', marginBottom: 4 }}>{doc.notes}</div>}
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
              <tr style={{ background: HEAD }}>
                <td style={{ padding: '10px 12px', border, fontWeight: 700, fontSize: 15, textAlign: start }}>{L('الإجمالي', 'Total', { inline: true })}</td>
                <td style={{ padding: '10px 12px', border, fontWeight: 700, fontSize: 17, textAlign: end, whiteSpace: 'nowrap' }}>
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

        {/* Signature & stamp — issued invoices only */}
        {seal && (
          <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60 }}>
            {[
              { label: L('التوقيع', 'Signature', { inline: true }), src: images.signature },
              { label: L('الختم', 'Stamp', { inline: true }), src: images.stamp },
            ].map(({ label, src }, i) => (
              <div key={i}>
                <div style={{ height: 92, borderBottom: '1px solid #999', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {src && <img src={src} alt="" data-seal={i === 0 ? 'signature' : 'stamp'} style={{ maxHeight: 88, maxWidth: '80%', objectFit: 'contain' }} />}
                </div>
                <div style={{ marginTop: 6, color: MUTED, fontSize: 12, textAlign: 'center' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: a thin rule and one centred line, as in a Word footer */}
        <div style={{ marginTop: 24, paddingTop: 8, borderTop: `1px solid ${GRID}`, textAlign: 'center', fontSize: 12, color: MUTED }}>
          {L('شكراً لتعاملكم معنا', 'Thank you for your business', { inline: true })}
          {company.phone && <> · {num(company.phone)}</>}
          {company.crNo && (
            <>
              {' '}
              · {lang === 'en' ? 'CR' : 'س.ت'} {num(company.crNo)}
            </>
          )}
        </div>
      </div>
    )
  },
)

function TotalRow({ label, value, bold, start, end }: { label: ReactNode; value: ReactNode; bold?: boolean; start: string; end: string }) {
  const border = `1px solid ${GRID}`
  return (
    <tr>
      <td style={{ padding: '7px 12px', border, color: bold ? '#1c1917' : '#444', fontWeight: bold ? 700 : 400, textAlign: start as 'left', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '7px 12px', border, textAlign: end as 'left', fontWeight: bold ? 700 : 500, whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )
}
