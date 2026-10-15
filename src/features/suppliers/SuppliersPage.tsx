import { t } from '../../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Phone, Plus, ShoppingCart, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../../components/format'
import { Segmented } from '../../components/form'
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import { formatOMR } from '../../domain/money'
import { ar } from '../../i18n/ar'
import { supplierBalances } from '../../services/suppliers'
import { SupplierFormModal } from './SupplierFormModal'

export function SuppliersPage() {
  const [tab, setTab] = useState<'suppliers' | 'purchases'>('suppliers')
  const [creating, setCreating] = useState(false)
  const suppliers = useLiveQuery(
    async () => (await db.suppliers.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [],
  )
  const balances = useLiveQuery(() => supplierBalances(db), [])
  const purchases = useLiveQuery(
    async () =>
      (await db.purchases.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [],
  )
  const names = new Map(suppliers?.map((s) => [s.id, s.name]))
  const totalDue = [...(balances?.values() ?? [])].reduce((a, b) => a + b, 0)

  return (
    <>
      <PageHeader
        title={ar.nav.suppliers}
        actions={
          <>
            <LinkButton to="/purchases/new">
              <ShoppingCart className="size-5" /> {t("فاتورة شراء", "Purchase invoice")}
            </LinkButton>
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="size-5" /> {t("مورد جديد", "New supplier")}
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={t("إجمالي المستحق للموردين", "Total owed to suppliers")} value={formatOMR(totalDue)} tone={totalDue > 0 ? 'red' : undefined} />
        <Stat label={t("عدد الموردين", "Number of suppliers")} value={suppliers?.length ?? 0} />
      </div>
      <div className="mb-5 max-w-xs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'suppliers', label: t("الموردون", "Suppliers") },
            { value: 'purchases', label: t("المشتريات", "Purchases") },
          ]}
        />
      </div>

      {tab === 'suppliers' && (
        <Card className="!p-0 overflow-hidden">
          {suppliers && !suppliers.length && (
            <EmptyState icon={Truck} title={t("لا يوجد موردون بعد", "No suppliers yet")} description={t("أضف أول مورد لتسجيل المشتريات.", "Add your first supplier to record purchases.")} />
          )}
          <ul>
            {suppliers?.map((s) => {
              const due = balances?.get(s.id) ?? 0
              return (
                <li key={s.id} className="border-b border-stone-100 last:border-0">
                  <Link to={`/suppliers/${s.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {s.name} {!s.active && <Badge>{t("موقوف", "Inactive")}</Badge>}
                      </div>
                      {s.phone && (
                        <div className="mt-0.5 flex items-center gap-1 text-sm text-stone-500">
                          <Phone className="size-3.5" /> <span className="num">{s.phone}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="text-xs text-stone-500">{t("المستحق", "Balance due")}</div>
                      <div className={`num font-bold ${due > 0 ? 'text-red-700' : 'text-stone-700'}`}>{formatOMR(due)}</div>
                    </div>
                    <ChevronLeft className="size-5 text-stone-400 ltr:rotate-180" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {tab === 'purchases' && (
        <Card className="!p-0 overflow-hidden">
          {purchases && !purchases.length && <EmptyState icon={ShoppingCart} title={t("لا توجد مشتريات بعد", "No purchases yet")} />}
          <ul>
            {purchases?.map((p) => (
              <li key={p.id} className="border-b border-stone-100 last:border-0">
                <Link to={`/purchases/${p.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone-50">
                  <div className="flex-1">
                    <div className="font-medium">{names.get(p.supplierId) ?? '—'}</div>
                    <div className="text-sm text-stone-500">
                      <span className="num">{formatDate(p.date)}</span>
                      {p.supplierInvoiceNo && <> {t("· فاتورة", "· invoice")} <span className="num">#{p.supplierInvoiceNo}</span></>}
                      {' · '}
                      {p.lines.length} {t("بند", "lines")}
                    </div>
                  </div>
                  <div className="num font-bold">{formatOMR(p.totalBaisa)}</div>
                  <ChevronLeft className="size-5 text-stone-400 ltr:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SupplierFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
