import type { Agreement } from '../../data/schedule'
import { agreementStatus } from '../../domain/schedule'
import { t } from '../../i18n/index'

export type PermitState = { state: 'valid' | 'expiring' | 'expired' | 'missing'; permit?: Agreement; daysLeft?: number }

/** The product's current sale permit (active, latest end date) and its state today. */
export function permitFor(productId: string, agreements: Agreement[], today: string): PermitState {
  const permits = agreements
    .filter((a) => a.kind === 'product_permit' && a.productId === productId && a.active)
    .filter((a) => !a.startDate || a.startDate <= today)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
  const p = permits[0]
  if (!p) return { state: 'missing' }
  const { status, daysLeft } = agreementStatus(p, today)
  return { state: status === 'active' ? 'valid' : status, permit: p, daysLeft }
}

export function permitLabel(s: PermitState): string {
  switch (s.state) {
    case 'missing':
      return t('لا يوجد تصريح بيع', 'No sale permit')
    case 'expired':
      return t('تصريح البيع منتهٍ', 'Sale permit expired')
    case 'expiring':
      return t(`التصريح ينتهي خلال ${s.daysLeft} يوماً`, `Permit ends in ${s.daysLeft} days`)
    case 'valid':
      return t('مُصرَّح بالبيع', 'Sale permitted')
  }
}

export const PERMIT_TONE = { valid: 'green', expiring: 'amber', expired: 'red', missing: 'red' } as const
