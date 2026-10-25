import { HandCoins, Pencil, Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Button, Card, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchSupplierDetail } from '../../data/inventory'
import { useQuery } from '../../data/useQuery'
import { statement } from '../../domain/fefo'
import { formatOMR } from '../../domain/money'
import { t } from '../../i18n/index'
import { methodLabel } from '../inventory/labels'
import { formatDate } from '../tasks/labels'
import { PaymentModal } from './PaymentModal'
import { SupplierFormModal } from './SupplierFormModal'

export function SupplierPage() {
  const { id = '' } = useParams()
  const q = useQuery(`supplier:${id}`, () => fetchSupplierDetail(id))
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)

  if (!q.data) {
    return (
      <>
        <PageHeader title={t('المورد', 'Supplier')} back={{ to: '/suppliers', label: t('الموردون', 'Suppliers') }} />
        {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </>
    )
  }

  const { supplier, purchases, payments } = q.data
  const bought = purchases.reduce((s, p) => s + p.totalBaisa, 0)
  const paid = payments.reduce((s, p) => s + p.amountBaisa, 0)
  const rows = statement([
    ...purchases.map((p) => ({
      id: p.id,
      date: p.date,
      kind: 'purchase' as const,
      ref: p.supplierInvoiceNo ?? '',
      amountBaisa: p.totalBaisa,
    })),
    ...payments.map((p) => ({ id: p.id, date: p.date, kind: 'payment' as const, ref: methodLabel(p.method), amountBaisa: p.amountBaisa })),
  ]).reverse()

  return (
    <>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.kind ?? undefined}
        back={{ to: '/suppliers', label: t('الموردون', 'Suppliers') }}
        actions={
          <>
            {supplier.phone && (
              <a href={`tel:${supplier.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4" dir="ltr">
                <Phone className="size-4" />
                {supplier.phone}
              </a>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              {t('تعديل', 'Edit')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t('المشتريات', 'Purchases')} value={formatOMR(bought)} />
          <Stat label={t('المدفوع', 'Paid')} value={formatOMR(paid)} />
          <Stat label={t('المستحق', 'Due')} value={formatOMR(bought - paid)} tone={bought - paid > 0 ? 'red' : 'green'} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={`/purchases/new?supplier=${supplier.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 font-medium text-on-brand">
            <Plus className="size-5" />
            {t('فاتورة شراء', 'New purchase')}
          </Link>
          <Button variant="secondary" onClick={() => setPaying(true)}>
            <HandCoins className="size-5" />
            {t('تسجيل دفعة', 'Record payment')}
          </Button>
        </div>

        <Card className="p-0">
          <h2 className="px-5 pt-4 pb-2 text-lg font-bold">{t('كشف الحساب', 'Statement')}</h2>
          {!rows.length ? (
            <p className="px-5 pb-5 text-muted">{t('لا توجد حركات بعد.', 'Nothing yet.')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const body = (
                  <>
                    <span className="num w-24 shrink-0 text-sm text-muted">{formatDate(r.date)}</span>
                    <div className="min-w-0 flex-1">
                      <div>{r.kind === 'purchase' ? t('فاتورة شراء', 'Purchase') : t('دفعة', 'Payment')}</div>
                      {r.ref && <div className="text-sm text-muted">{r.ref}</div>}
                    </div>
                    <span className={`num w-32 text-end ${r.kind === 'payment' ? 'text-palm' : ''}`}>
                      {r.kind === 'payment' ? '−' : '+'}
                      {formatOMR(r.amountBaisa)}
                    </span>
                    <span className="num hidden w-32 text-end font-bold sm:block">{formatOMR(r.balance)}</span>
                  </>
                )
                return (
                  <li key={r.id}>
                    {r.kind === 'purchase' ? (
                      <Link to={`/purchases/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-5 py-3">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {(supplier.address || supplier.email || supplier.vatNo || supplier.notes) && (
          <Card>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {supplier.address && (
                <div>
                  <dt className="text-muted">{t('العنوان', 'Address')}</dt>
                  <dd>{supplier.address}</dd>
                </div>
              )}
              {supplier.email && (
                <div>
                  <dt className="text-muted">{t('البريد', 'Email')}</dt>
                  <dd dir="ltr" className="text-start">
                    {supplier.email}
                  </dd>
                </div>
              )}
              {supplier.vatNo && (
                <div>
                  <dt className="text-muted">{t('الرقم الضريبي', 'VAT no.')}</dt>
                  <dd>{supplier.vatNo}</dd>
                </div>
              )}
              {supplier.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-muted">{t('ملاحظات', 'Notes')}</dt>
                  <dd className="whitespace-pre-line">{supplier.notes}</dd>
                </div>
              )}
            </dl>
          </Card>
        )}
      </div>

      {editing && <SupplierFormModal supplier={supplier} onClose={() => setEditing(false)} />}
      {paying && <PaymentModal supplierId={supplier.id} dueBaisa={bought - paid} onClose={() => setPaying(false)} />}
    </>
  )
}
