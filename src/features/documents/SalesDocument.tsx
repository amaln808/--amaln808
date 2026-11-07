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

/** Date-bark brown of the logo: headings, rules and the total */
const BRAND = '#5b4a2f'
/** Ripe-date amber: the thin second rule and small accents */
const DATE = '#b08a55'
const INK = '#1f1d19'
const MUTED = '#6f6a62'
/** Light sand behind the table header, and the hairlines between rows */
const SAND = '#f4efe6'
const GRID = '#ddd5c7'

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
        ? L('فاتورة ضريبية', 'Tax invoice')
        : L('فاتورة', 'Invoice')
      : L('عرض أسعار', 'Quotation')
    const options = !isInvoice && doc.options?.length ? doc.options : null
    const rule = `1px solid ${GRID}`
    const cell = (align: 'start' | 'end' | 'center' = 'start'): React.CSSProperties => ({
      padding: '9px 10px',
      textAlign: align === 'start' ? start : align === 'end' ? end : 'center',
      borderBottom: rule,
      verticalAlign: 'middle',
    })
    const th = (align: 'start' | 'end' | 'center', width?: number): React.CSSProperties => ({
      ...cell(align),
      width,
      background: SAND,
      color: BRAND,
      fontWeight: 700,
      fontSize: 13,
      borderBottom: `1.5px solid ${BRAND}`,
    })
    // Small «label  value» lines, aligned in two columns
    const facts = (rows: Array<[ReactNode, ReactNode]>, size = 13) => (
      <table style={{ borderCollapse: 'collapse', fontSize: size, lineHeight: 1.75 }}>
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i}>
              <td style={{ padding: 0, paddingInlineEnd: 14, color: MUTED, textAlign: start, whiteSpace: 'nowrap' }}>{k}</td>
              <td style={{ padding: 0, color: INK, fontWeight: 500, textAlign: start }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
    const companyFacts: Array<[ReactNode, ReactNode]> = [
      ...(company.crNo ? [[L('السجل التجاري', 'CR no.', { inline: true }), num(company.crNo)] as [ReactNode, ReactNode]] : []),
      ...(company.vatRegistered && company.vatNo ? [[L('الرقم الضريبي', 'VAT no.', { inline: true }), num(company.vatNo)] as [ReactNode, ReactNode]] : []),
      ...(company.phone ? [[L('الهاتف', 'Tel', { inline: true }), num(company.phone)] as [ReactNode, ReactNode]] : []),
      [
        L('العنوان', 'Address', { inline: true }),
        lang === 'en' ? (company.addressEn ? `${company.addressEn}, Oman` : 'Sultanate of Oman') : company.address ? `${company.address}، سلطنة عُمان` : 'سلطنة عُمان',
      ],
    ]
    const docFacts: Array<[ReactNode, ReactNode]> = [
      [isInvoice ? L('رقم الفاتورة', 'Invoice no.', { inline: true }) : L('رقم العرض', 'Quotation no.', { inline: true }), <b key="n">{num(doc.number)}</b>],
      [L('التاريخ', 'Date', { inline: true }), num(formatDate(doc.date))],
      ...(doc.untilDate
        ? [[isInvoice ? L('تاريخ الاستحقاق', 'Due date', { inline: true }) : L('ساري حتى', 'Valid until', { inline: true }), num(formatDate(doc.untilDate))] as [ReactNode, ReactNode]]
        : []),
    ]

    return (
      <div
        ref={ref}
        dir={rtl ? 'rtl' : 'ltr'}
        lang={lang === 'en' ? 'en' : 'ar'}
        style={{
          width: 794,
          minHeight: 1123,
          padding: '46px 58px 34px',
          background: '#fff',
          color: INK,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          fontSize: 13.5,
          fontVariantNumeric: 'tabular-nums',
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

        {/* Letterhead: the logo on one side, the business details stacked on the other (left, in Arabic) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <img src={images.logo} alt="" style={{ height: 96, width: 'auto', objectFit: 'contain' }} />
            <div dir="ltr" style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: 4, color: BRAND }}>Zuwardah</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: BRAND, lineHeight: 1.3 }}>
              {lang === 'en' ? company.nameEn || company.name : company.name}
              {lang === 'both' && company.nameEn && (
                <span dir="ltr" style={{ fontWeight: 500, fontSize: 13, color: MUTED, unicodeBidi: 'isolate' }}>
                  {'  '}
                  {company.nameEn}
                </span>
              )}
            </div>
            {facts(companyFacts, 12.5)}
          </div>
        </div>
        {/* Double rule: the one decorative device, in the brand's colours */}
        <div style={{ marginTop: 16, borderTop: `2.5px solid ${BRAND}` }} />
        <div style={{ marginTop: 3, borderTop: `1px solid ${DATE}` }} />

        {/* Title, centred, with a short rule under it */}
        <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 27, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{title}</div>
          <div style={{ width: 54, borderTop: `2px solid ${DATE}` }} />
        </div>

        {/* Customer and document details */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 28 }}>
          <div style={{ borderInlineStart: `3px solid ${BRAND}`, paddingInlineStart: 12, lineHeight: 1.7 }}>
            <div style={{ color: MUTED, fontSize: 12.5 }}>{isInvoice ? L('فاتورة إلى', 'Bill to', { inline: true }) : L('مقدَّم إلى', 'Prepared for', { inline: true })}</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: INK }}>{doc.customer?.name ?? '—'}</div>
            {doc.customer?.phone && <div style={{ fontSize: 13 }}>{num(doc.customer.phone)}</div>}
            {doc.customer?.address && <div style={{ fontSize: 13 }}>{doc.customer.address}</div>}
            {doc.customer?.vatNo && (
              <div style={{ fontSize: 13 }}>
                {lang === 'en' ? 'VAT no.' : 'الرقم الضريبي'}: {num(doc.customer.vatNo)}
              </div>
            )}
          </div>
          {facts(docFacts)}
        </div>

        {/* Items */}
        <table style={{ width: '100%', marginTop: 26, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th('center', 34)}>#</th>
              <th style={th('start')}>{L('الصنف', 'Item')}</th>
              {showLots && <th style={th('center', 140)}>{L('الدفعة / الانتهاء', 'Batch / expiry')}</th>}
              <th style={th('center', 82)}>{L('الكمية', 'Qty')}</th>
              <th style={th('end', 104)}>{L('سعر الوحدة', 'Unit price')}</th>
              <th style={th('end', 112)}>{L('المبلغ', 'Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i}>
                <td style={{ ...cell('center'), color: MUTED }}>{i + 1}</td>
                <td style={{ ...cell('start'), fontWeight: 500 }}>{itemName(l)}</td>
                {showLots && (
                  <td style={{ ...cell('center'), fontSize: 12, color: '#3d3a35' }}>
                    {l.lots.length
                      ? l.lots.map((lot, j) => (
                          <div key={j} style={{ lineHeight: 1.45 }}>
                            {num(lot.code ?? '—')}
                            {lot.expiry && <span style={{ color: MUTED }}> / {num(formatDate(lot.expiry))}</span>}
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
        <div style={{ marginTop: 6, color: MUTED, fontSize: 11.5, textAlign: end }}>{L('المبالغ بالريال العماني', 'Amounts in Omani rials (OMR)', { inline: true })}</div>

        {/* Quotation: price per way of paying */}
        {options && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, color: BRAND, marginBottom: 6, fontSize: 14 }}>{L('خيارات الأسعار حسب طريقة الدفع', 'Prices by payment option', { inline: true })}</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: lang === 'both' ? '1fr 330px' : '1fr 290px', gap: 30, alignItems: 'end' }}>
          <div style={{ fontSize: 12.5, color: '#3d3a35', lineHeight: 1.7 }}>
            {(doc.notes || doc.untilDate) && <div style={{ fontWeight: 700, color: BRAND, marginBottom: 2 }}>{L('ملاحظات', 'Notes', { inline: true })}</div>}
            {doc.notes && <div style={{ whiteSpace: 'pre-line', marginBottom: 4 }}>{doc.notes}</div>}
            {doc.untilDate &&
              (isInvoice ? (
                <div>{L(`يُرجى السداد قبل ${formatDate(doc.untilDate)}.`, `Please pay by ${formatDate(doc.untilDate)}.`)}</div>
              ) : (
                <div>{L(`هذا العرض ساري حتى ${formatDate(doc.untilDate)}.`, `This quotation is valid until ${formatDate(doc.untilDate)}.`)}</div>
              ))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <TotalRow label={L('المجموع', 'Subtotal', { inline: true })} value={num(formatBaisa(doc.subtotalBaisa))} start={start} end={end} />
              {doc.discountBaisa > 0 && <TotalRow label={L('الخصم', 'Discount', { inline: true })} value={num(`− ${formatBaisa(doc.discountBaisa)}`)} start={start} end={end} />}
              {company.vatRegistered && <TotalRow label={L('ضريبة القيمة المضافة', 'VAT', { inline: true })} value={num(formatBaisa(doc.vatBaisa))} start={start} end={end} />}
              <tr style={{ background: BRAND, color: '#fff' }}>
                <td style={{ padding: '11px 14px', fontWeight: 700, fontSize: 15, textAlign: start }}>{L('الإجمالي', 'Total', { inline: true })}</td>
                <td style={{ padding: '11px 14px', fontWeight: 700, fontSize: 18, textAlign: end, whiteSpace: 'nowrap' }}>
                  {num(formatBaisa(doc.totalBaisa))} <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>{currency}</span>
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
          <div style={{ marginTop: 30, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 70 }}>
            {[
              { label: L('التوقيع', 'Signature', { inline: true }), src: images.signature },
              { label: L('الختم', 'Stamp', { inline: true }), src: images.stamp },
            ].map(({ label, src }, i) => (
              <div key={i}>
                <div style={{ height: 92, borderBottom: `1px solid ${GRID}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {src && <img src={src} alt="" data-seal={i === 0 ? 'signature' : 'stamp'} style={{ maxHeight: 88, maxWidth: '80%', objectFit: 'contain' }} />}
                </div>
                <div style={{ marginTop: 6, color: MUTED, fontSize: 12, textAlign: 'center' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: a thin rule and the business in one quiet line */}
        <div style={{ marginTop: 26, paddingTop: 9, borderTop: `1px solid ${DATE}`, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 22px', fontSize: 11.5, color: MUTED }}>
          <span style={{ color: BRAND, fontWeight: 500 }}>{L('شكراً لتعاملكم معنا', 'Thank you for your business', { inline: true })}</span>
          {company.phone && <span>{num(company.phone)}</span>}
          {company.crNo && (
            <span>
              {lang === 'en' ? 'CR' : 'س.ت'} {num(company.crNo)}
            </span>
          )}
        </div>
      </div>
    )
  },
)

function TotalRow({ label, value, bold, start, end }: { label: ReactNode; value: ReactNode; bold?: boolean; start: string; end: string }) {
  return (
    <tr style={{ borderBottom: `1px solid ${GRID}` }}>
      <td style={{ padding: '8px 14px', color: bold ? INK : MUTED, fontWeight: bold ? 700 : 400, textAlign: start as 'left', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '8px 14px', color: INK, textAlign: end as 'left', fontWeight: bold ? 700 : 500, whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )
}
