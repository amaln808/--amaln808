import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'
import { fetchLotSales } from '../../data/sales'
import { useQuery } from '../../data/useQuery'
import { formatQty } from '../../domain/quantity'
import { t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'

/** Forward traceability: which customers and invoices received this batch (useful for a recall). */
export function BatchSalesCard({ lotId }: { lotId: string }) {
  const q = useQuery(`batch:${lotId}:sales`, () => fetchLotSales(lotId))
  const list = q.data ?? []
  const sold = list.filter((s) => s.status === 'issued').reduce((sum, s) => sum + s.qty, 0)
  return (
    <Card className="p-0">
      <h2 className="px-5 pt-4 text-lg font-bold">{t('أين ذهبت هذه الدفعة', 'Where this batch went')}</h2>
      <p className="px-5 text-sm text-muted">
        {list.length ? t(`بيع منها ${formatQty(sold)} — للتتبع عند الاستدعاء.`, `${formatQty(sold)} sold — for recalls.`) : t('لم يُبع منها شيء بعد.', 'Nothing sold from it yet.')}
      </p>
      {list.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {list.map((s, i) => (
            <li key={i}>
              <Link to={`/invoices/${s.invoiceId}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-brand-50 ${s.status === 'void' ? 'opacity-60' : ''}`}>
                <span className="flex-1 font-medium">{s.customerName}</span>
                <span className="text-sm text-muted">
                  <span dir="ltr">{s.invoiceNo}</span> · {formatDate(s.date)}
                  {s.status === 'void' ? ` · ${t('ملغاة', 'void')}` : ''}
                </span>
                <span className="num font-bold">{formatQty(s.qty)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.length === 0 && <div className="pb-4" />}
    </Card>
  )
}
