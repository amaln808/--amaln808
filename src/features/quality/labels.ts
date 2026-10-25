import type { QcResult } from '../../data/quality'
import { t } from '../../i18n/index'

export function resultLabel(r: QcResult): string {
  return { pending: t('قيد الانتظار', 'Pending'), pass: t('مقبولة', 'Pass'), fail: t('مرفوضة', 'Fail') }[r]
}

export const RESULT_TONE = { pending: 'amber', pass: 'green', fail: 'red' } as const
