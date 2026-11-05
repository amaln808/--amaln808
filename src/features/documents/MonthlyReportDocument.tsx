import { forwardRef, type ReactNode } from 'react'
import { formatDate } from '../../components/format'
import { formatBaisa } from '../../domain/money'
import { change, type MonthlyReport } from '../../domain/monthlyReport'
import { monthLabel } from '../../domain/periods'
import { formatQty } from '../../domain/quantity'
import type { DocLang } from '../../i18n/index'
import type { DocCompany, DocImages } from './SalesDocument'

export interface ReportDocData {
  report: MonthlyReport
  /** Names in both languages, resolved by the page */
  names: { product: (id: string) => [string, string]; customer: (id: string) => string; category: (id: string) => [string, string] }
  /** Where things stand on the day the report is issued */
  position: { receivableBaisa: number; overdueBaisa: number; payableBaisa: number; stockBaisa: number; openOrders: number }
  issuedOn: string
}

const BRAND = '#5b4a2f'
const TINT = '#f6f1e8'
const LINE = '#e7e2d8'
const MUTED = '#78716c'
const GOOD = '#2f6b4f'
const BAD = '#b91c1c'

/** A4 monthly report (794 px wide): profit against the month before, sales, production, cash, and where things stand. */
export const MonthlyReportDocument = forwardRef<HTMLDivElement, { data: ReportDocData; company: DocCompany; images: DocImages; lang: DocLang }>(
  function MonthlyReportDocument({ data, company, images, lang }, ref) {
    const rtl = lang !== 'en'
    const start = rtl ? 'right' : 'left'
    const end = rtl ? 'left' : 'right'
    const { report: r, names, position: pos } = data
    const k = r.now
    const p = r.before

    const L = (ar: string, en: string): ReactNode => {
      if (lang === 'ar') return ar
      if (lang === 'en') return en
      return (
        <>
          {ar}
          <span style={{ opacity: 0.45 }}> / </span>
          <span dir="ltr" style={{ unicodeBidi: 'isolate', opacity: 0.7, fontSize: '0.85em' }}>
            {en}
          </span>
        </>
      )
    }
    const pick = ([ar, en]: [string, string]) => (lang === 'en' ? en || ar : ar)
    const num = (v: string) => <span style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}>{v}</span>
    const money = (b: number) => num(b < 0 ? `(${formatBaisa(-b)})` : formatBaisa(b))
    const pct = (v: number | null) => (v == null ? '—' : num(`${Math.round(v * 100)}%`))
    /** ▲ 12% in green when it is good news, red when not */
    const delta = (now: number, before: number, costly = false) => {
      const c = change(now, before)
      if (c == null || Math.round(c * 100) === 0) return <span style={{ color: MUTED }}>{c == null ? '—' : num('0%')}</span>
      const up = c > 0
      return <span style={{ color: up !== costly ? GOOD : BAD, fontWeight: 600 }}>{num(`${up ? '▲' : '▼'} ${Math.abs(Math.round(c * 100))}%`)}</span>
    }
    const cell = (align: 'start' | 'end' | 'center' = 'start'): React.CSSProperties => ({
      padding: '5px 10px',
      textAlign: align === 'start' ? start : align === 'end' ? end : 'center',
      borderBottom: `1px solid ${LINE}`,
    })
    const title = (text: ReactNode) => <div style={{ fontWeight: 700, color: BRAND, fontSize: 15, margin: '12px 0 4px' }}>{text}</div>
    const kv = (rows: Array<[ReactNode, ReactNode, boolean?]>) => (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([a, b, strong], i) => (
            <tr key={i} style={{ fontWeight: strong ? 700 : 400 }}>
              <td style={cell('start')}>{a}</td>
              <td style={{ ...cell('end'), whiteSpace: 'nowrap' }}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )

    const pnl: Array<{ label: ReactNode; now: number; before: number; costly?: boolean; strong?: boolean; sub?: ReactNode }> = [
      { label: L('الإيرادات (بدون ضريبة)', 'Revenue (excl. VAT)'), now: k.revenueBaisa, before: p.revenueBaisa },
      { label: L('تكلفة البضاعة المباعة', 'Cost of goods sold'), now: k.cogsBaisa, before: p.cogsBaisa, costly: true },
      { label: L('مجمل الربح', 'Gross profit'), now: k.grossProfitBaisa, before: p.grossProfitBaisa, strong: true, sub: pct(k.grossMargin) },
      { label: L('المصروفات', 'Expenses'), now: k.expensesBaisa, before: p.expensesBaisa, costly: true },
      ...(k.samplesBaisa || p.samplesBaisa ? [{ label: L('العينات الترويجية', 'Promotional samples'), now: k.samplesBaisa, before: p.samplesBaisa, costly: true }] : []),
      ...(k.depreciationBaisa || p.depreciationBaisa ? [{ label: L('إهلاك المعدات', 'Equipment depreciation'), now: k.depreciationBaisa, before: p.depreciationBaisa, costly: true }] : []),
      { label: L('صافي الربح', 'Net profit'), now: k.netProfitBaisa, before: p.netProfitBaisa, strong: true, sub: pct(k.netMargin) },
    ]
    const net = k.cashInBaisa - k.cashOutBaisa

    return (
      <div
        ref={ref}
        dir={rtl ? 'rtl' : 'ltr'}
        lang={lang === 'en' ? 'en' : 'ar'}
        style={{
          width: 794,
          minHeight: 1123,
          padding: '32px 44px 24px',
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
            <img src={images.logo} alt="" style={{ height: 68, width: 'auto', objectFit: 'contain' }} />
            <div dir="ltr" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 3, color: BRAND }}>Zuwardah</div>
          </div>
          <div style={{ textAlign: end }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: BRAND, lineHeight: 1.15 }}>{L('التقرير الشهري', 'MONTHLY REPORT')}</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700 }}>
              {lang === 'en' ? monthLabel(r.month, 'en') : lang === 'both' ? `${monthLabel(r.month, 'ar')} / ${monthLabel(r.month, 'en')}` : monthLabel(r.month, 'ar')}
            </div>
            <div style={{ color: MUTED, fontSize: 12 }}>
              {num(`${formatDate(r.range.from)} — ${formatDate(r.range.to)}`)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 8, borderTop: `2px solid ${BRAND}`, color: '#44403c', fontSize: 12, display: 'flex', gap: 20 }}>
          <span style={{ fontWeight: 700 }}>{lang === 'en' ? company.nameEn || company.name : company.name}</span>
          <span>{L('للاستخدام الداخلي', 'Internal use')}</span>
        </div>

        {/* Headline figures */}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            [L('الإيرادات', 'Revenue'), money(k.revenueBaisa), delta(k.revenueBaisa, p.revenueBaisa)],
            [L('صافي الربح', 'Net profit'), money(k.netProfitBaisa), delta(k.netProfitBaisa, p.netProfitBaisa)],
            [L('صافي النقد', 'Net cash'), money(net), delta(net, p.cashInBaisa - p.cashOutBaisa)],
            [L('عبوات منتجة', 'Jars made'), num(formatQty(k.unitsProduced)), delta(k.unitsProduced, p.unitsProduced)],
          ].map(([label, value, d], i) => (
            <div key={i} style={{ background: i === 1 ? TINT : '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ color: MUTED, fontSize: 12 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: i === 1 ? (k.netProfitBaisa < 0 ? BAD : BRAND) : undefined }}>{value}</div>
              <div style={{ fontSize: 11 }}>
                {d} <span style={{ color: MUTED }}>{L('عن الشهر السابق', 'vs last month')}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Profit */}
        {title(L('الأرباح والخسائر', 'Profit and loss'))}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: BRAND, color: '#fff' }}>
              <th style={{ ...cell('start'), fontWeight: 500, borderBottom: 'none' }}>{L('البند', 'Item')}</th>
              <th style={{ ...cell('end'), fontWeight: 500, borderBottom: 'none', width: 120 }}>{lang === 'en' ? monthLabel(r.month, 'en') : monthLabel(r.month, 'ar')}</th>
              <th style={{ ...cell('end'), fontWeight: 500, borderBottom: 'none', width: 120 }}>{L('الشهر السابق', 'Last month')}</th>
              <th style={{ ...cell('center'), fontWeight: 500, borderBottom: 'none', width: 90 }}>{L('التغير', 'Change')}</th>
            </tr>
          </thead>
          <tbody>
            {pnl.map((row, i) => (
              <tr key={i} style={{ fontWeight: row.strong ? 700 : 400, background: row.strong ? TINT : '#fff' }}>
                <td style={cell('start')}>
                  {row.label}
                  {row.sub && (
                    <span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}>
                      {' '}
                      — {L('الهامش', 'margin')} {row.sub}
                    </span>
                  )}
                </td>
                <td style={cell('end')}>{money(row.now)}</td>
                <td style={{ ...cell('end'), color: '#57534e' }}>{money(row.before)}</td>
                <td style={cell('center')}>{delta(row.now, row.before, row.costly)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            {title(L('المبيعات', 'Sales'))}
            {kv([
              [L('عدد الفواتير', 'Invoices'), num(String(k.invoiceCount))],
              [L('العبوات المباعة', 'Jars sold'), num(formatQty(k.unitsSold))],
              [L('طلبيات جديدة', 'New orders'), <>{num(String(r.orders.count))}{r.orders.valueBaisa > 0 && <span style={{ color: MUTED }}> · {money(r.orders.valueBaisa)}</span>}</>],
            ])}
            {r.products.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                <thead>
                  <tr style={{ background: TINT, color: BRAND }}>
                    <th style={{ ...cell('start'), fontWeight: 700 }}>{L('المنتج', 'Product')}</th>
                    <th style={{ ...cell('center'), fontWeight: 700 }}>{L('الكمية', 'Qty')}</th>
                    <th style={{ ...cell('end'), fontWeight: 700 }}>{L('الإيراد', 'Revenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.products.map((x) => (
                    <tr key={x.itemId}>
                      <td style={cell('start')}>{pick(names.product(x.itemId))}</td>
                      <td style={cell('center')}>{num(formatQty(x.qty))}</td>
                      <td style={cell('end')}>{money(x.revenueBaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.customers.length > 0 && (
              <>
                {title(L('أكبر العملاء', 'Top customers'))}
                {kv(r.customers.map((c) => [names.customer(c.key), money(c.total)]))}
              </>
            )}
          </div>
          <div>
            {title(L('الإنتاج والمشتريات', 'Production and purchases'))}
            {kv([
              [L('دفعات الإنتاج', 'Production batches'), num(String(r.batches))],
              [L('العبوات المنتجة', 'Jars made'), num(formatQty(k.unitsProduced))],
              [L('متوسط تكلفة العبوة', 'Average cost per jar'), k.avgUnitCostBaisa == null ? '—' : money(k.avgUnitCostBaisa)],
              [L('مشتريات المواد', 'Material purchases'), money(r.purchasesBaisa)],
            ])}
            {title(L('المصروفات حسب التصنيف', 'Expenses by category'))}
            {r.expenses.length ? (
              kv([...r.expenses.map((e): [ReactNode, ReactNode] => [pick(names.category(e.key)), money(e.total)]), [L('الإجمالي', 'Total'), money(k.expensesBaisa), true]])
            ) : (
              <div style={{ color: MUTED, padding: '6px 10px' }}>{L('لا مصروفات في هذا الشهر.', 'No expenses this month.')}</div>
            )}
            {title(L('النقد', 'Cash'))}
            {kv([
              [L('داخل (مقبوضات العملاء)', 'In (customer payments)'), money(k.cashInBaisa)],
              [L('خارج (للموردين + المصروفات)', 'Out (suppliers + expenses)'), money(k.cashOutBaisa)],
              [L('الصافي', 'Net'), <span style={{ color: net < 0 ? BAD : GOOD }}>{money(net)}</span>, true],
            ])}
          </div>
        </div>

        {title(
          <>
            {L('الوضع بتاريخ', 'Position on')} {num(formatDate(data.issuedOn))}
          </>,
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
          {[
            [L('المستحق لي', 'Owed to me'), money(pos.receivableBaisa), pos.overdueBaisa > 0 ? <span style={{ color: BAD }}>{L('منه متأخر', 'overdue')} {money(pos.overdueBaisa)}</span> : null],
            [L('المستحق عليّ', 'Owed by me'), money(pos.payableBaisa), null],
            [L('قيمة المخزون', 'Stock value'), money(pos.stockBaisa), null],
            [L('طلبيات جارية', 'Open orders'), num(String(pos.openOrders)), null],
          ].map(([label, value, sub], i) => (
            <div key={i} style={{ padding: '10px 12px', borderInlineStart: i ? `1px solid ${LINE}` : undefined }}>
              <div style={{ color: MUTED, fontSize: 12 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
              {sub && <div style={{ fontSize: 11 }}>{sub}</div>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 14 }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>
            {L(
              'الربح بتواريخ الفواتير، والنقد بتواريخ الدفع الفعلية. المبالغ بالريال العماني.',
              'Profit uses invoice dates; cash uses actual payment dates. Amounts in Omani rials.',
            )}
          </div>
          <div style={{ padding: '8px 14px', background: TINT, borderRadius: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#44403c' }}>
            <span style={{ fontWeight: 700, color: BRAND }}>
              {L('صدر في', 'Issued on')} {num(formatDate(data.issuedOn))}
            </span>
            <span>{company.phone && num(company.phone)}</span>
          </div>
        </div>
      </div>
    )
  },
)
