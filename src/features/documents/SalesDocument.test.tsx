import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { type DocData, SalesDocument } from './SalesDocument'
import type { DocStatus } from './seal'

const company = { name: 'زوردة', nameEn: 'Zawrda', phone: '77681600', crNo: '1552738', vatNo: null, address: 'بوشر', addressEn: 'Bausher', vatRegistered: false }
const images = { logo: 'logo.png', stamp: 'STAMP.png', signature: 'SIGNATURE.png' }
const doc = (kind: DocData['kind'], status: DocStatus): DocData => ({
  kind,
  status,
  number: kind === 'invoice' ? 'INV-0001' : 'Q-0001',
  date: '2026-10-10',
  untilDate: '2026-10-25',
  customer: { name: 'عميل', phone: null, address: null, vatNo: null },
  lines: [{ name: 'معجون 250', nameEn: null, unit: 'piece', qty: 10, unitPriceBaisa: 1500, grossBaisa: 15000, lots: [{ code: 'B-0007', expiry: '2027-03-01' }] }],
  subtotalBaisa: 15000,
  discountBaisa: 0,
  vatBaisa: 0,
  totalBaisa: 15000,
  notes: null,
})
const html = (d: DocData) => renderToStaticMarkup(<SalesDocument doc={d} company={company} images={images} lang="ar" />)

describe('SalesDocument', () => {
  it('puts the stamp and signature on an issued invoice, with the batch and expiry of each line', () => {
    const out = html(doc('invoice', 'issued'))
    expect(out).toContain('STAMP.png')
    expect(out).toContain('SIGNATURE.png')
    expect(out).toContain('B-0007')
    expect(out).toContain('01/03/2027')
    expect(out).not.toContain('فاتورة ضريبية')
  })

  it('never shows the stamp or signature on a quotation or a voided invoice, even when given', () => {
    for (const d of [doc('quote', 'draft'), doc('quote', 'sent'), doc('quote', 'invoiced'), doc('invoice', 'void')]) {
      const out = html(d)
      expect(out).not.toContain('STAMP.png')
      expect(out).not.toContain('SIGNATURE.png')
    }
    expect(html(doc('invoice', 'void'))).toContain('ملغاة')
  })

  it('lists the price of each payment option on a quotation only', () => {
    const options = [{ ar: 'الدفع مقدماً', en: 'Payment in advance', prices: [1425], totalBaisa: 14250 }]
    const quote = html({ ...doc('quote', 'sent'), options })
    expect(quote).toContain('خيارات الأسعار حسب طريقة الدفع')
    expect(quote).toContain('الدفع مقدماً')
    expect(quote).toContain('14.250')
    expect(html({ ...doc('invoice', 'issued'), options })).not.toContain('الدفع مقدماً')
  })
})

