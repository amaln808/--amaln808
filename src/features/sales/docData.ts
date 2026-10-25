import type { ItemWithStock } from '../../data/inventory'
import type { Customer, SaleLine } from '../../data/sales'
import { lineTotal } from '../../domain/money'
import type { DocData } from '../documents/SalesDocument'
import type { DocStatus } from '../documents/seal'

/** Builds what the PDF needs from a quotation or invoice and its lines. */
export function toDocData(p: {
  kind: DocData['kind']
  status: DocStatus
  number: string
  date: string
  untilDate: string | null
  customer: Customer | undefined
  lines: SaleLine[]
  products: Map<string, ItemWithStock>
  totals: { subtotalBaisa: number; discountBaisa: number; vatBaisa: number; totalBaisa: number }
  paidBaisa?: number
  notes: string | null
}): DocData {
  return {
    kind: p.kind,
    status: p.status,
    number: p.number,
    date: p.date,
    untilDate: p.untilDate,
    customer: p.customer ? { name: p.customer.name, phone: p.customer.phone, address: p.customer.address, vatNo: p.customer.vatNo } : null,
    lines: p.lines.map((l) => {
      const prod = p.products.get(l.productId)
      return {
        name: prod?.name ?? '—',
        nameEn: prod?.nameEn ?? null,
        unit: prod?.unit ?? 'piece',
        qty: l.qty,
        unitPriceBaisa: l.unitPriceBaisa,
        grossBaisa: lineTotal(l.qty, l.unitPriceBaisa),
        lots: l.lots.map((x) => ({ code: x.lotCode, expiry: x.expiryDate })),
      }
    }),
    ...p.totals,
    paidBaisa: p.paidBaisa,
    notes: p.notes,
  }
}

/** WhatsApp / email message sent with the PDF. */
export function shareMessage(kind: DocData['kind'], number: string, totalText: string, company: string, lang: 'ar' | 'en' | 'both'): string {
  const ar = kind === 'invoice' ? `مرفق فاتورة رقم ${number} بمبلغ ${totalText}. شكراً لتعاملكم مع ${company}.` : `مرفق عرض السعر رقم ${number} بمبلغ ${totalText}. يسعدنا تعاونكم مع ${company}.`
  const en = kind === 'invoice' ? `Please find invoice ${number} for ${totalText} attached. Thank you for choosing ${company}.` : `Please find quotation ${number} for ${totalText} attached. We look forward to working with you.`
  return lang === 'ar' ? ar : lang === 'en' ? en : `${ar}\n\n${en}`
}
