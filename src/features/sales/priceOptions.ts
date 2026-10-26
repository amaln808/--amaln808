import type { PriceOption } from '../../domain/quoteOptions'
import { t } from '../../i18n/index'

/** Arabic and English name of a quotation price option («الدفع بعد 60 يوماً أو أكثر»). */
export function optionLabels(o: PriceOption): { ar: string; en: string } {
  switch (o.key) {
    case 'advance':
      return { ar: 'الدفع مقدماً', en: 'Payment in advance' }
    case 'installments':
      return { ar: 'الدفع على دفعات', en: 'Payment in instalments' }
    case 'deferred':
      return { ar: `الدفع بعد ${o.n ?? 60} يوماً أو أكثر`, en: `Payment after ${o.n ?? 60}+ days` }
    case 'bulk':
      return { ar: `للكميات فوق ${o.n ?? 1000} علبة`, en: `Quantities over ${o.n ?? 1000} jars` }
  }
}

export const optionLabel = (o: PriceOption) => {
  const l = optionLabels(o)
  return t(l.ar, l.en)
}
