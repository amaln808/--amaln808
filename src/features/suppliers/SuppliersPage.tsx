import { ChevronLeft, Plus, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchSuppliers, SUPPLIERS_KEY } from '../../data/inventory'
import { useQuery } from '../../data/useQuery'
import { formatOMR } from '../../domain/money'
import { t } from '../../i18n/index'
import { supplierKindLabel } from '../inventory/labels'
import { SupplierFormModal } from './SupplierFormModal'

export function SuppliersPage() {
  const q = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const list = q.data ?? []
  const active = list.filter((s) => s.active)
  const due = list.reduce((s, x) => s + x.dueBaisa, 0)

  return (
    <>
      <PageHeader
        title={t('الموردون', 'Suppliers')}
        actions={
          <>
            <Link to="/purchases/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4">
              {t('فاتورة شراء', 'Purchase')}
            </Link>
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-5" />
              {t('مورد جديد', 'New supplier')}
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:max-w-lg">
        <Stat label={t('المستحق للموردين', 'Owed to suppliers')} value={formatOMR(due)} tone={due > 0 ? 'red' : undefined} />
        <Stat label={t('عدد الموردين', 'Suppliers')} value={active.length} />
      </div>
      {q.error && !q.data && <FormError message={serverError(q.error)} />}
      <Card className="p-0">
        {!active.length ? (
          <EmptyState icon={Truck} title={q.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا يوجد موردون بعد', 'No suppliers yet')} />
        ) : (
          <ul className="divide-y divide-line">
            {active.map((s) => (
              <li key={s.id}>
                <Link to={`/suppliers/${s.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-brand-50">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-muted">
                      {supplierKindLabel(s.kind)}
                      {s.phone ? ` · ${s.phone}` : ''}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className={`num font-bold ${s.dueBaisa > 0 ? 'text-red-700' : ''}`}>{formatOMR(s.dueBaisa)}</div>
                    <div className="text-xs text-muted">{t('مستحق', 'due')}</div>
                  </div>
                  <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {adding && <SupplierFormModal onClose={(id) => (setAdding(false), id && navigate(`/suppliers/${id}`))} />}
    </>
  )
}
