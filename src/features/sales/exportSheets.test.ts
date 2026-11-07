import { describe, expect, it } from 'vitest'
import { buildSalesSheets, type ExportDoc } from './exportSheets'

const doc = (id: string, no: string, total: number, extra: Partial<ExportDoc> = {}): ExportDoc => ({
  id, no, date: '2026-11-03', customer: 'جمعية الخير', channel: 'إغاثة', until: '2026-11-18', status: 'غير مدفوعة', counts: true,
  subtotalBaisa: total, discountBaisa: 0, vatBaisa: 0, totalBaisa: total, paidBaisa: 0, notes: null, ...extra,
})

describe('sales export sheets', () => {
  it('lists invoices with what is left to pay, and adds up all but the void ones', () => {
    const [docs, lines] = buildSalesSheets(
      'invoice',
      [doc('a', 'INV-0001', 550000, { paidBaisa: 275000 }), doc('b', 'INV-0002', 99000, { status: 'ملغاة', counts: false })],
      [
        { docId: 'a', product: 'معجون 250', qty: 500, unitPriceBaisa: 1100, discountBaisa: 0, vatBaisa: 0, lots: ['B-0001', 'B-0002'] },
        { docId: 'zzz', product: 'outside the export', qty: 1, unitPriceBaisa: 1, discountBaisa: 0, vatBaisa: 0 },
      ],
    )
    expect(docs.data[1].map((c) => c?.value)).toEqual(['INV-0001', '03/11/2026', 'جمعية الخير', 'إغاثة', '18/11/2026', 'غير مدفوعة', 550, 0, 0, 550, 275, 275, undefined])
    // Void invoice: listed, no paid / left, not in the totals
    expect(docs.data[2].slice(10, 12)).toEqual([null, null])
    const totals = docs.data.at(-1)!
    expect(totals[0]?.value).toMatch(/1/)
    expect(totals.slice(6, 12).map((c) => c?.value)).toEqual([550, 0, 0, 550, 275, 275])
    expect(lines.data).toHaveLength(2)
    expect(lines.data[1].map((c) => c?.value)).toEqual(['INV-0001', '03/11/2026', 'جمعية الخير', 'معجون 250', 500, 1.1, 550, 0, 0, 550, 'B-0001، B-0002'])
  })

  it('lists quotations with the invoice each became', () => {
    const [docs, lines] = buildSalesSheets('quote', [doc('q', 'Q-0001', 44000, { status: 'مقبول', invoiceNo: 'INV-0001' })], [
      { docId: 'q', product: 'معجون 250', qty: 40, unitPriceBaisa: 1100, discountBaisa: 0, vatBaisa: 0 },
    ])
    expect(docs.data[0]).toHaveLength(11)
    expect(docs.data[1].map((c) => c?.value)).toEqual(['Q-0001', '03/11/2026', 'جمعية الخير', '18/11/2026', 'مقبول', 44, 0, 0, 44, 'INV-0001', undefined])
    expect(lines.data[1].map((c) => c?.value)).toEqual(['Q-0001', '03/11/2026', 'جمعية الخير', 'معجون 250', 40, 1.1, 44])
  })
})
