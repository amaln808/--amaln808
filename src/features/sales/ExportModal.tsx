import { useState } from 'react'
import { Field, FormError, Select } from '../../components/form'
import { Modal } from '../../components/Modal'
import { initialPeriod, PeriodFilter, resolvePeriod } from '../../components/PeriodFilter'
import { Button } from '../../components/ui'
import { serverError } from '../../data/errors'
import type { ItemWithStock } from '../../data/inventory'
import { fetchExportLines, type SalesData } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { formatOMR } from '../../domain/money'
import { inRange } from '../../domain/periods'
import { nameOf, t } from '../../i18n/index'
import { shareOrDownload } from '../documents/share'
import { buildSalesSheets, type ExportDoc } from './exportSheets'
import { type InvoiceInfo, invoiceStatusLabel, quoteStatusLabel, quoteStatusOf } from './summary'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Invoices or quotations of a period (and optionally one customer) to an Excel file: one sheet of documents, one of lines. */
export function ExportModal({
  kind,
  data,
  invoiceInfo,
  products,
  onClose,
}: {
  kind: 'invoice' | 'quote'
  data: SalesData
  invoiceInfo: Map<string, InvoiceInfo>
  products: ItemWithStock[]
  onClose: () => void
}) {
  const [period, setPeriod] = useState(() => initialPeriod('thisYear'))
  const [customerId, setCustomerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayIso()
  const range = resolvePeriod(period)
  const customerName = new Map(data.customers.map((c) => [c.id, c.name]))
  const channelName = new Map(data.channels.map((c) => [c.id, c.name]))
  const productName = new Map(products.map((p) => [p.id, nameOf(p)]))
  const invoiceNo = new Map(data.invoices.map((i) => [i.id, i.invoiceNo]))
  const pick = <T extends { date: string; customerId: string }>(rows: T[]) =>
    rows.filter((r) => inRange(r.date, range) && (!customerId || r.customerId === customerId)).sort((a, b) => a.date.localeCompare(b.date))

  const docs: ExportDoc[] =
    kind === 'invoice'
      ? pick(data.invoices).map((i) => {
          const info = invoiceInfo.get(i.id)
          return {
            id: i.id,
            no: i.invoiceNo,
            date: i.date,
            customer: customerName.get(i.customerId) ?? '',
            channel: i.channelId ? channelName.get(i.channelId) : undefined,
            until: i.status === 'issued' ? i.dueDate : null,
            status: info ? invoiceStatusLabel(info.status) : '',
            counts: i.status === 'issued',
            subtotalBaisa: i.subtotalBaisa,
            discountBaisa: i.discountBaisa,
            vatBaisa: i.vatBaisa,
            totalBaisa: i.totalBaisa,
            paidBaisa: info?.paidBaisa ?? 0,
            notes: i.status === 'void' ? [i.voidReason, i.notes].filter(Boolean).join(' · ') || null : i.notes,
          }
        })
      : pick(data.quotations).map((q) => ({
          id: q.id,
          no: q.quoteNo,
          date: q.date,
          customer: customerName.get(q.customerId) ?? '',
          until: q.validUntil,
          status: quoteStatusLabel(quoteStatusOf(q, today)),
          counts: true,
          subtotalBaisa: q.subtotalBaisa,
          discountBaisa: q.discountBaisa,
          vatBaisa: q.vatBaisa,
          totalBaisa: q.totalBaisa,
          invoiceNo: q.invoiceId ? invoiceNo.get(q.invoiceId) : null,
          notes: q.notes,
        }))
  const total = docs.filter((d) => d.counts).reduce((s, d) => s + d.totalBaisa, 0)
  const customers = data.customers.filter((c) => (kind === 'invoice' ? data.invoices : data.quotations).some((x) => x.customerId === c.id))

  const run = async () => {
    setError(null)
    setBusy(true)
    try {
      const lines = (await fetchExportLines(kind)).map((l) => ({ ...l, product: productName.get(l.productId) ?? '—' }))
      const sheets = buildSalesSheets(kind, docs, lines)
      const { default: writeXlsxFile } = await import('write-excel-file/browser')
      const blob = await writeXlsxFile(
        sheets.map((s) => ({
          sheet: s.sheet,
          data: s.data,
          rightToLeft: true,
          stickyRowsCount: 1,
          columns: (s.data[0] ?? []).map((_, i) => ({
            width: Math.min(36, Math.max(11, ...s.data.slice(0, 200).map((r) => String(r[i]?.value ?? '').length + 3))),
          })),
        })),
      ).toBlob()
      const from = range.from.startsWith('0000') ? '' : `${range.from}_${range.to}`
      const base = kind === 'invoice' ? t('الفواتير', 'Invoices') : t('عروض الأسعار', 'Quotations')
      await shareOrDownload(blob, `${[base, customerId ? customerName.get(customerId) : '', from].filter(Boolean).join(' ')}.xlsx`, XLSX)
      onClose()
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'invoice' ? t('تصدير الفواتير إلى Excel', 'Export invoices to Excel') : t('تصدير عروض الأسعار إلى Excel', 'Export quotations to Excel')}
      footer={
        <Button className="flex-1" onClick={run} disabled={busy || !docs.length}>
          {busy ? t('جارٍ التجهيز…', 'Preparing…') : t(`تصدير ${docs.length}`, `Export ${docs.length}`)}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('الفترة', 'Period')}>
          <PeriodFilter value={period} onChange={setPeriod} />
        </Field>
        <Field label={t('العميل', 'Customer')}>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{t('كل العملاء', 'All customers')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm">
          {docs.length
            ? kind === 'invoice'
              ? t(`${docs.length} فاتورة، مجموعها ${formatOMR(total)} (دون الملغاة).`, `${docs.length} invoices, ${formatOMR(total)} in all (void ones excluded).`)
              : t(`${docs.length} عرض أسعار، مجموعها ${formatOMR(total)}.`, `${docs.length} quotations, ${formatOMR(total)} in all.`)
            : t('لا شيء في هذه الفترة.', 'Nothing in this period.')}
        </p>
        <p className="text-sm text-muted">
          {kind === 'invoice'
            ? t('الملف فيه ورقتان: «الفواتير» (المجموع والخصم والضريبة والمدفوع والمتبقي لكل فاتورة) و«البنود» (المنتج والكمية والسعر ورقم الدفعة لكل بند).', 'Two sheets: «Invoices» (totals, discount, VAT, paid and left for each) and «Lines» (product, qty, price and batch for each line).')
            : t('الملف فيه ورقتان: «عروض الأسعار» (الحالة والإجمالي والفاتورة التي صدرت منه) و«البنود» (المنتج والكمية والسعر).', 'Two sheets: «Quotations» (status, total and the invoice it became) and «Lines» (product, qty and price).')}
        </p>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
