import { Download } from 'lucide-react'
import { useState } from 'react'
import { useSettingsQuery } from '../../app/settingsContext'
import { FormError, Segmented, Select } from '../../components/form'
import { Button, Card, PageHeader, Stat } from '../../components/ui'
import { db } from '../../data/client'
import { serverError } from '../../data/errors'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { formatBaisa, formatOMR } from '../../domain/money'
import { quarterOf, quarterRange, vatSummary } from '../../domain/vat'
import { t } from '../../i18n/index'
import { shareOrDownload } from '../documents/share'
import { formatDate } from '../tasks/labels'

type Q = '1' | '2' | '3' | '4'

interface VatRow {
  kind: 'invoice' | 'purchase' | 'expense'
  date: string
  ref: string
  party: string
  netBaisa: number
  vatBaisa: number
}

/** Every VAT amount: issued invoices (output) and purchases and expenses (input). */
async function fetchVatRows(): Promise<VatRow[]> {
  const [inv, pur, exp] = await Promise.all([
    db().from('sales_invoices').select('date, invoice_no, subtotal_baisa, discount_baisa, vat_baisa, customers(name)').eq('status', 'issued'),
    db().from('purchases').select('date, supplier_invoice_no, subtotal_baisa, vat_baisa, suppliers(name)'),
    db().from('expenses').select('date, amount_baisa, vat_baisa, notes, suppliers(name), expense_categories(name)'),
  ])
  for (const r of [inv, pur, exp]) if (r.error) throw r.error
  const name = (x: unknown) => (x as { name?: string } | null)?.name ?? ''
  return [
    ...inv.data!.map((r) => ({
      kind: 'invoice' as const,
      date: r.date as string,
      ref: r.invoice_no as string,
      party: name(r.customers),
      netBaisa: Number(r.subtotal_baisa) - Number(r.discount_baisa),
      vatBaisa: Number(r.vat_baisa),
    })),
    ...pur.data!.map((r) => ({
      kind: 'purchase' as const,
      date: r.date as string,
      ref: (r.supplier_invoice_no as string | null) ?? '',
      party: name(r.suppliers),
      netBaisa: Number(r.subtotal_baisa),
      vatBaisa: Number(r.vat_baisa),
    })),
    ...exp.data!.map((r) => ({
      kind: 'expense' as const,
      date: r.date as string,
      ref: name(r.expense_categories),
      party: name(r.suppliers),
      netBaisa: Number(r.amount_baisa) - Number(r.vat_baisa),
      vatBaisa: Number(r.vat_baisa),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

const kindLabel = (k: VatRow['kind']) => ({ invoice: t('فاتورة مبيعات', 'Sales invoice'), purchase: t('فاتورة شراء', 'Purchase'), expense: t('مصروف', 'Expense') })[k]

/** Quarterly VAT: output (issued invoices) − input (purchases and expenses) = net to pay or reclaim. */
export function VatPage() {
  const q = useQuery('vat', fetchVatRows)
  const settings = useSettingsQuery().data
  const now = quarterOf(todayIso())
  const [year, setYear] = useState(now.year)
  const [quarter, setQuarter] = useState<Q>(String(now.quarter) as Q)
  const [error, setError] = useState<string | null>(null)
  const range = quarterRange(year, Number(quarter) as 1 | 2 | 3 | 4)
  const rows = (q.data ?? []).filter((r) => r.date >= range.from && r.date <= range.to)
  const { outputBaisa, inputBaisa, netBaisa } = vatSummary(
    rows.filter((r) => r.kind === 'invoice'),
    rows.filter((r) => r.kind !== 'invoice'),
    range,
  )
  const years = Array.from({ length: 4 }, (_, i) => now.year - i)

  const exportExcel = async () => {
    setError(null)
    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser')
      const head = [t('النوع', 'Type'), t('التاريخ', 'Date'), t('المرجع', 'Reference'), t('الجهة', 'Party'), t('المبلغ قبل الضريبة', 'Net'), t('الضريبة', 'VAT')]
      const data = [
        head.map((value) => ({ value, fontWeight: 'bold' as const })),
        ...rows.map((r) => [
          { value: kindLabel(r.kind) },
          { value: formatDate(r.date) },
          { value: r.ref },
          { value: r.party },
          { value: r.netBaisa / 1000, format: '0.000' },
          { value: r.vatBaisa / 1000, format: '0.000' },
        ]),
        [],
        [{ value: t('ضريبة المخرجات', 'Output VAT'), fontWeight: 'bold' as const }, null, null, null, null, { value: outputBaisa / 1000, format: '0.000' }],
        [{ value: t('ضريبة المدخلات', 'Input VAT'), fontWeight: 'bold' as const }, null, null, null, null, { value: inputBaisa / 1000, format: '0.000' }],
        [{ value: t('الصافي', 'Net'), fontWeight: 'bold' as const }, null, null, null, null, { value: netBaisa / 1000, format: '0.000' }],
      ]
      const blob = await writeXlsxFile(data, { rightToLeft: true, columns: [{ width: 16 }, { width: 12 }, { width: 16 }, { width: 28 }, { width: 18 }, { width: 12 }] }).toBlob()
      await shareOrDownload(blob, `VAT-${year}-Q${quarter}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <>
      <PageHeader
        title={t('تقرير الضريبة الربع سنوي', 'Quarterly VAT report')}
        actions={
          <Button variant="secondary" onClick={exportExcel} disabled={!q.data}>
            <Download className="size-5" />
            {t('تصدير Excel', 'Export Excel')}
          </Button>
        }
      />
      {!settings?.vatRegistered && (
        <p className="mb-5 rounded-xl bg-brand-50 px-4 py-3 text-sm leading-relaxed">
          {t(
            'المنشأة غير مسجّلة ضريبياً: الفواتير بلا ضريبة (المخرجات = 0)، والضريبة المدفوعة على المشتريات لا تُسترد بل تدخل في تكلفة المواد. التقرير جاهز ليوم التسجيل.',
            'Not VAT-registered: invoices carry no VAT (output = 0), and VAT paid on purchases is not reclaimable — it is part of material cost. The report is ready for when you register.',
          )}
        </p>
      )}
      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('السنة', 'Year')}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Segmented<Q>
            value={quarter}
            onChange={setQuarter}
            options={[
              { value: '1', label: t('ق1 يناير–مارس', 'Q1 Jan–Mar') },
              { value: '2', label: t('ق2 أبريل–يونيو', 'Q2 Apr–Jun') },
              { value: '3', label: t('ق3 يوليو–سبتمبر', 'Q3 Jul–Sep') },
              { value: '4', label: t('ق4 أكتوبر–ديسمبر', 'Q4 Oct–Dec') },
            ]}
          />
        </div>
      </Card>
      {q.error && !q.data && <FormError message={serverError(q.error)} />}
      <FormError message={error} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t('ضريبة المخرجات (المحصلة)', 'Output VAT (collected)')} value={formatOMR(outputBaisa)} />
        <Stat label={t('ضريبة المدخلات (المدفوعة)', 'Input VAT (paid)')} value={formatOMR(inputBaisa)} />
        <Stat label={netBaisa >= 0 ? t('الصافي المستحق للدفع', 'Net to pay') : t('الصافي المسترد', 'Net to reclaim')} value={formatOMR(Math.abs(netBaisa))} tone={netBaisa > 0 ? 'red' : netBaisa < 0 ? 'green' : undefined} />
      </div>
      <Card className="p-0">
        <h2 className="px-5 pt-4 text-lg font-bold">
          {t('التفصيل', 'Details')} <span className="text-sm font-normal text-muted">({formatDate(range.from)} – {formatDate(range.to)})</span>
        </h2>
        {!rows.length ? (
          <p className="px-5 pb-4 pt-2 text-sm text-muted">{q.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد حركات في هذا الربع.', 'Nothing in this quarter.')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className={`rounded-lg px-2 py-0.5 text-xs ${r.kind === 'invoice' ? 'bg-brand-50 text-brand-800' : 'bg-stone-100'}`}>{kindLabel(r.kind)}</span>
                <span className="min-w-0 flex-1">
                  {r.party || '—'} <span className="text-sm text-muted">· {r.ref} · {formatDate(r.date)}</span>
                </span>
                <span className="num text-sm text-muted">{formatBaisa(r.netBaisa)}</span>
                <span className="num w-24 text-end font-bold">{formatBaisa(r.vatBaisa)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
