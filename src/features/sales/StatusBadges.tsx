import { Badge } from '../../components/ui'
import type { InvoiceStatus, QuoteDisplayStatus } from '../../domain/sales'
import { ar } from '../../i18n/ar'

const INVOICE_TONES = { paid: 'green', partial: 'amber', unpaid: 'stone', overdue: 'red' } as const
const QUOTE_TONES = { draft: 'stone', sent: 'amber', accepted: 'green', rejected: 'red', expired: 'red', invoiced: 'green' } as const

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={INVOICE_TONES[status]}>{ar.invoiceStatus[status]}</Badge>
}

export function QuoteStatusBadge({ status }: { status: QuoteDisplayStatus }) {
  return <Badge tone={QUOTE_TONES[status]}>{ar.quoteStatus[status]}</Badge>
}
