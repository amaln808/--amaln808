import { History } from 'lucide-react'
import { useState } from 'react'
import { FormError, Select } from '../../components/form'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import { db } from '../../data/client'
import { serverError } from '../../data/errors'
import { useQuery } from '../../data/useQuery'
import { isRTL, t } from '../../i18n/index'

interface AuditRow {
  id: number
  at: string
  user_id: string | null
  table_name: string
  record_id: string | null
  action: 'insert' | 'update' | 'delete'
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

function tableLabel(name: string): string {
  const labels: Record<string, [string, string]> = {
    settings: ['الإعدادات', 'Settings'],
    members: ['الأعضاء', 'Members'],
    doc_counters: ['الترقيم', 'Numbering'],
    suppliers: ['الموردون', 'Suppliers'],
    items: ['الأصناف', 'Items'],
    stock_lots: ['دفعات المخزون', 'Stock lots'],
    stock_movements: ['حركات المخزون', 'Stock movements'],
    purchases: ['المشتريات', 'Purchases'],
    purchase_lines: ['بنود المشتريات', 'Purchase lines'],
    supplier_payments: ['دفعات الموردين', 'Supplier payments'],
    recipes: ['الوصفات', 'Recipes'],
    recipe_components: ['مكونات الوصفات', 'Recipe components'],
    production_batches: ['دفعات الإنتاج', 'Production batches'],
    batch_consumption: ['استهلاك الإنتاج', 'Batch consumption'],
    quality_checks: ['فحوص الجودة', 'Quality checks'],
    channels: ['القنوات', 'Channels'],
    channel_prices: ['أسعار القنوات', 'Channel prices'],
    customers: ['العملاء', 'Customers'],
    quotations: ['عروض الأسعار', 'Quotations'],
    quotation_lines: ['بنود العروض', 'Quotation lines'],
    sales_invoices: ['الفواتير', 'Invoices'],
    invoice_lines: ['بنود الفواتير', 'Invoice lines'],
    invoice_line_lots: ['دفعات بنود الفواتير', 'Invoice line lots'],
    customer_payments: ['المقبوضات', 'Customer payments'],
    expense_categories: ['تصنيفات المصروفات', 'Expense categories'],
    expenses: ['المصروفات', 'Expenses'],
    agreements: ['الاتفاقيات والتصاريح', 'Agreements & permits'],
    tasks: ['المهام', 'Tasks'],
    task_completions: ['إنجاز المهام', 'Task completions'],
  }
  const l = labels[name]
  return l ? t(l[0], l[1]) : name
}

const ACTION = {
  insert: () => t('إضافة', 'Added'),
  update: () => t('تعديل', 'Changed'),
  delete: () => t('حذف', 'Deleted'),
}
const ACTION_TONE = { insert: 'text-palm', update: 'text-brand-800', delete: 'text-red-700' }

const HIDDEN = new Set(['updated_at', 'created_at', 'created_by'])

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** Fields whose value differs between before and after. */
export function changedFields(row: Pick<AuditRow, 'action' | 'old_data' | 'new_data'>): Array<[string, unknown, unknown]> {
  const before = row.old_data ?? {}
  const after = row.new_data ?? {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys]
    .filter((k) => !HIDDEN.has(k) && k !== 'id' && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => [k, before[k], after[k]])
}

async function fetchAudit(table: string): Promise<{ rows: AuditRow[]; names: Record<string, string> }> {
  let q = db().from('audit_log').select('*').order('id', { ascending: false }).limit(200)
  if (table) q = q.eq('table_name', table)
  const [{ data, error }, members] = await Promise.all([q, db().from('members').select('user_id, display_name')])
  if (error) throw error
  const names = Object.fromEntries((members.data ?? []).map((m) => [m.user_id as string, (m.display_name as string) ?? '']))
  return { rows: data as AuditRow[], names }
}

export function AuditPage() {
  const [table, setTable] = useState('')
  const q = useQuery(`audit:${table}`, () => fetchAudit(table))
  const rows = q.data?.rows ?? []
  const tables = [
    'settings', 'suppliers', 'items', 'stock_lots', 'purchases', 'supplier_payments', 'recipes', 'production_batches',
    'quality_checks', 'channels', 'channel_prices', 'customers', 'quotations', 'sales_invoices', 'customer_payments',
    'expense_categories', 'expenses', 'agreements', 'tasks', 'task_completions',
  ]

  return (
    <>
      <PageHeader
        title={t('سجل التعديلات', 'Change history')}
        subtitle={t('كل إضافة أو تعديل أو حذف تسجله قاعدة البيانات تلقائياً، ولا يمكن تعديل هذا السجل.', 'Every addition, change and deletion is recorded by the database itself and cannot be edited.')}
      />
      <div className="mb-4 max-w-xs">
        <Select value={table} onChange={(e) => setTable(e.target.value)} aria-label={t('القسم', 'Section')}>
          <option value="">{t('كل الأقسام', 'All sections')}</option>
          {tables.map((n) => (
            <option key={n} value={n}>
              {tableLabel(n)}
            </option>
          ))}
        </Select>
      </div>
      {q.error && <FormError message={serverError(q.error)} />}
      <Card className="p-0">
        {!rows.length ? (
          <EmptyState icon={History} title={q.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد تعديلات بعد', 'No changes yet')} />
        ) : (
          <ol className="divide-y divide-line">
            {rows.map((r) => {
              const fields = r.action === 'update' ? changedFields(r) : []
              return (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`font-bold ${ACTION_TONE[r.action]}`}>{ACTION[r.action]()}</span>
                    <span>{tableLabel(r.table_name)}</span>
                    <span className="num ms-auto text-sm text-muted">{new Date(r.at).toLocaleString(t('ar-OM', 'en-GB'))}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {r.user_id ? q.data?.names[r.user_id] || t('عضو', 'Member') : t('النظام', 'System')}
                  </div>
                  {fields.length > 0 && (
                    <dl className="mt-2 grid gap-1 text-sm">
                      {fields.slice(0, 6).map(([k, before, after]) => (
                        <div key={k} className="flex flex-wrap gap-x-2">
                          <dt className="text-muted" dir="ltr">{k}</dt>
                          <dd className="min-w-0 break-words">
                            <span className="text-muted line-through">{show(before)}</span> {isRTL() ? '←' : '→'} <span>{show(after)}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Card>
    </>
  )
}
