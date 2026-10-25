import type { ItemType, Lot, PaymentMethod } from '../../data/inventory'
import { t } from '../../i18n/index'

export function itemTypeLabel(type: ItemType): string {
  return { raw: t('مادة خام', 'Raw material'), packaging: t('تغليف', 'Packaging'), finished: t('منتج نهائي', 'Finished product') }[type]
}

export function movementLabel(type: string): string {
  const labels: Record<string, [string, string]> = {
    purchase: ['شراء', 'Purchase'],
    production_in: ['إنتاج', 'Produced'],
    production_out: ['استهلاك في الإنتاج', 'Used in production'],
    sale: ['بيع', 'Sale'],
    sale_void: ['إلغاء بيع', 'Sale voided'],
    adjustment: ['تسوية', 'Adjustment'],
    waste: ['تالف', 'Waste'],
    return: ['مرتجع', 'Return'],
  }
  const l = labels[type]
  return l ? t(l[0], l[1]) : type
}


export function methodLabel(m: PaymentMethod): string {
  return { cash: t('نقداً', 'Cash'), bank: t('تحويل بنكي', 'Bank transfer'), card: t('بطاقة', 'Card'), other: t('أخرى', 'Other') }[m]
}

export const METHODS: PaymentMethod[] = ['cash', 'bank', 'card', 'other']

export function sourceLabel(s: Lot['sourceType']): string {
  return {
    purchase: t('شراء', 'Purchase'),
    production: t('إنتاج', 'Production'),
    opening: t('رصيد افتتاحي', 'Opening stock'),
    adjustment: t('تسوية', 'Adjustment'),
  }[s]
}
