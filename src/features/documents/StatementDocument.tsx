import { forwardRef, type ReactNode } from 'react'
import { formatDate } from '../../components/format'
import { formatBaisa } from '../../domain/money'
import type { Statement } from '../../domain/statement'
import type { DocLang } from '../../i18n/index'
import type { DocCompany, DocImages } from './SalesDocument'

export interface StatementDocData {
  customer: { name: string; phone: string | null; address: string | null; vatNo: string | null }
  /** null = from the first entry */
  from: string | null
  to: string
  issuedOn: string
  statement: Statement
  /** Invoices and orders still unpaid at the end, oldest first */
  open: Array<{ ref: string; date: string; dueDate: string | null; leftBaisa: number; late: boolean }>
}

const BRAND = '#5b4a2f'
const TINT = '#f6f1e8'
const LINE = '#e7e2d8'
const MUTED = '#78716c'
const RED = '#b91c1c'

const METHOD: Record<string, [string, string]> = {
  cash: ['نقداً', 'cash'],
  bank: ['تحويل بنكي', 'bank transfer'],
  card: ['بطاقة', 'card'],
  other: ['أخرى', 'other'],
}

/** A4 statement of account for a customer (794 px wide), captured to PDF. No stamp or signature. */
export const StatementDocument = forwardRef<HTMLDivElement, { data: StatementDocData; company: DocCompany; images: DocImages; lang: DocLang }>(
  function StatementDocument({ data, company, images, lang }, ref) {
    const rtl = lang !== 'en'
    const start = rtl ? 'right' : 'left'
    const end = rtl ? 'left' : 'right'
    const currency = lang === 'en' ? 'OMR' : lang === 'both' ? 'ر.ع / OMR' : 'ر.ع'
    const s = data.statement

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
    /** Plain text in the document language (bilingual: Arabic only, to keep table rows short) */
    const T = (ar: string, en: string) => (lang === 'en' ? en : ar)
    const num = (v: string) => <span style={{ direction: 'ltr', unicodeBidi: 'bidi-override', display: 'inline-block' }}>{v}</span>
    const money = (b: number) => num(b < 0 ? `(${formatBaisa(-b)})` : formatBaisa(b))
    const cell = (align: 'start' | 'end' | 'center' = 'start'): React.CSSProperties => ({
      padding: '7px 9px',
      textAlign: align === 'start' ? start : align === 'end' ? end : 'center',
      borderBottom: `1px solid ${LINE}`,
      verticalAlign: 'middle',
    })
    const head = (align: 'start' | 'end' | 'center', width?: number): React.CSSProperties => ({ ...cell(align), width, borderBottom: 'none', fontWeight: 500 })

    const describe = (r: Statement['rows'][number]): ReactNode => {
      if (r.kind === 'invoice') return <>{T('فاتورة', 'Invoice')} {num(r.ref ?? '')}</>
      if (r.kind === 'order') return <>{T('طلبية (لم تُفوتر بعد)', 'Order (not invoiced yet)')} {num(r.ref ?? '')}</>
      const m = r.method && METHOD[r.method] ? T(...METHOD[r.method]) : null
      return (
        <>
          {T('دفعة مستلمة', 'Payment received')}
          {m && ` — ${m}`}
          {r.ref ? (
            <>
              {' '}
              · {T('عن', 'for')} {num(r.ref)}
            </>
          ) : (
            ` · ${T('تحت الحساب', 'on account')}`
          )}
        </>
      )
    }
    const addressAr = company.address ? `${company.address} — سلطنة عُمان` : 'سلطنة عُمان'
    const addressEn = company.addressEn ? `${company.addressEn}, Sultanate of Oman` : 'Sultanate of Oman'
    const closing = s.closingBaisa

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
          fontSize: 13,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 8, background: BRAND }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <img src={images.logo} alt="" style={{ height: 90, width: 'auto', objectFit: 'contain' }} />
            <div dir="ltr" style={{ fontSize: 13, fontWeight: 600, letterSpacing: 3, color: BRAND }}>Zuwardah</div>
          </div>
          <div style={{ textAlign: end, minWidth: 260 }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: BRAND, letterSpacing: lang === 'en' ? 1 : 0, lineHeight: 1.15 }}>{L('كشف حساب', 'STATEMENT OF ACCOUNT')}</div>
            <div style={{ marginTop: 6, fontSize: 14, color: '#44403c' }}>
              {data.from ? (
                <>
                  {L('من', 'From', { inline: true })} {num(formatDate(data.from))} {L('إلى', 'to', { inline: true })} {num(formatDate(data.to))}
                </>
              ) : (
                <>
                  {L('حتى', 'Up to', { inline: true })} {num(formatDate(data.to))}
                </>
              )}
            </div>
          </div>
        </div>

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
          <span>{lang === 'en' ? addressEn : addressAr}</span>
        </div>

        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
          <div style={{ background: TINT, borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ color: MUTED, fontSize: 12, marginBottom: 4 }}>{L('العميل', 'Customer', { inline: true })}</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{data.customer.name}</div>
            {data.customer.phone && <div style={{ color: '#44403c', marginTop: 2 }}>{num(data.customer.phone)}</div>}
            {data.customer.address && <div style={{ color: '#44403c' }}>{data.customer.address}</div>}
          </div>
          <div style={{ border: `2px solid ${BRAND}`, borderRadius: 12, padding: '12px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: MUTED, fontSize: 12 }}>
              {closing < 0 ? L('رصيد لصالحكم', 'Credit in your favour', { inline: true }) : L('الرصيد المستحق', 'Balance due', { inline: true })}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: BRAND }}>
              {num(formatBaisa(Math.abs(closing)))} <span style={{ fontSize: 13, fontWeight: 500 }}>{currency}</span>
            </div>
            <div style={{ color: MUTED, fontSize: 12 }}>
              {L('بتاريخ', 'As of', { inline: true })} {num(formatDate(data.to < data.issuedOn ? data.to : data.issuedOn))}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
          {[
            [L('الرصيد السابق', 'Opening balance'), s.openingBaisa],
            [L('الفواتير والطلبيات', 'Invoices & orders'), s.chargesBaisa],
            [L('المدفوعات', 'Payments'), s.paymentsBaisa],
            [L('الرصيد الختامي', 'Closing balance'), s.closingBaisa],
          ].map(([label, v], i) => (
            <div key={i} style={{ padding: '10px 14px', borderInlineStart: i ? `1px solid ${LINE}` : undefined, background: i === 3 ? TINT : '#fff' }}>
              <div style={{ color: MUTED, fontSize: 12 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{money(v as number)}</div>
            </div>
          ))}
        </div>

        {/* Movements */}
        <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: BRAND, color: '#fff' }}>
              <th style={head('center', 86)}>{L('التاريخ', 'Date')}</th>
              <th style={head('start')}>{L('البيان', 'Description')}</th>
              <th style={head('end', 96)}>{L('مدين', 'Debit')}</th>
              <th style={head('end', 96)}>{L('دائن', 'Credit')}</th>
              <th style={head('end', 104)}>{L('الرصيد', 'Balance')}</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: TINT }}>
              <td style={cell('center')}>{data.from ? num(formatDate(data.from)) : ''}</td>
              <td style={{ ...cell('start'), fontWeight: 700 }}>{T('الرصيد السابق', 'Opening balance')}</td>
              <td style={cell('end')} />
              <td style={cell('end')} />
              <td style={{ ...cell('end'), fontWeight: 700 }}>{money(s.openingBaisa)}</td>
            </tr>
            {s.rows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 ? TINT : '#fff' }}>
                <td style={{ ...cell('center'), color: '#44403c' }}>{num(formatDate(r.date))}</td>
                <td style={cell('start')}>{describe(r)}</td>
                <td style={cell('end')}>{r.chargeBaisa ? money(r.chargeBaisa) : ''}</td>
                <td style={{ ...cell('end'), color: '#2f6b4f' }}>{r.paymentBaisa ? money(r.paymentBaisa) : ''}</td>
                <td style={{ ...cell('end'), fontWeight: 700 }}>{money(r.balanceBaisa)}</td>
              </tr>
            ))}
            {!s.rows.length && (
              <tr>
                <td colSpan={5} style={{ ...cell('center'), color: MUTED, padding: 16 }}>
                  {T('لا توجد حركات في هذه الفترة.', 'No transactions in this period.')}
                </td>
              </tr>
            )}
            <tr style={{ background: BRAND, color: '#fff', fontWeight: 700 }}>
              <td style={{ ...cell('center'), borderBottom: 'none' }} />
              <td style={{ ...cell('start'), borderBottom: 'none' }}>{T('الإجمالي', 'Total')}</td>
              <td style={{ ...cell('end'), borderBottom: 'none' }}>{money(s.chargesBaisa)}</td>
              <td style={{ ...cell('end'), borderBottom: 'none' }}>{money(s.paymentsBaisa)}</td>
              <td style={{ ...cell('end'), borderBottom: 'none', fontSize: 14 }}>{money(s.closingBaisa)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 6, color: MUTED, fontSize: 12, textAlign: end }}>{L('المبالغ بالريال العماني', 'Amounts in Omani rials (OMR)', { inline: true })}</div>

        {/* What is still unpaid */}
        {data.open.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, color: BRAND, marginBottom: 6, fontSize: 15 }}>{L('غير المسدد حتى الآن', 'Still unpaid', { inline: true })}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: TINT, color: BRAND }}>
                  <th style={{ ...cell('start'), fontWeight: 700 }}>{L('المستند', 'Document')}</th>
                  <th style={{ ...cell('center'), fontWeight: 700, width: 110 }}>{L('التاريخ', 'Date')}</th>
                  <th style={{ ...cell('center'), fontWeight: 700, width: 130 }}>{L('الاستحقاق', 'Due')}</th>
                  <th style={{ ...cell('end'), fontWeight: 700, width: 120 }}>{L('المتبقي', 'Left to pay')}</th>
                </tr>
              </thead>
              <tbody>
                {data.open.map((o, i) => (
                  <tr key={i}>
                    <td style={cell('start')}>{num(o.ref)}</td>
                    <td style={cell('center')}>{num(formatDate(o.date))}</td>
                    <td style={{ ...cell('center'), color: o.late ? RED : undefined, fontWeight: o.late ? 700 : undefined }}>
                      {o.dueDate ? num(formatDate(o.dueDate)) : '—'}
                      {o.late && ` · ${T('متأخر', 'overdue')}`}
                    </td>
                    <td style={{ ...cell('end'), fontWeight: 700 }}>{money(o.leftBaisa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 12, color: '#44403c' }}>
          {L(
            'يُرجى مراجعة الكشف، وإبلاغنا بأي ملاحظة خلال 15 يوماً من تاريخه.',
            'Please review this statement and let us know of any difference within 15 days.',
          )}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <div style={{ padding: '10px 16px', background: TINT, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#44403c' }}>
            <span style={{ fontWeight: 700, color: BRAND }}>
              {L('صدر في', 'Issued on', { inline: true })} {num(formatDate(data.issuedOn))}
            </span>
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
      </div>
    )
  },
)
