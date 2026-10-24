import { addDays } from 'date-fns'
import { CalendarPlus, Paperclip, Plus, RefreshCw, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { FormError } from '../../components/form'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { buildIcs, openIcs } from '../../domain/ics'
import type { Agreement, AgreementKind } from '../../data/schedule'
import { agreementStatus, day, durationParts, endAfterMonths, iso } from '../../domain/schedule'
import { nameOf, t } from '../../i18n/index'
import { daysLeftLabel, durationLabel, formatDate, kindLabel } from '../tasks/labels'
import { useSchedule } from '../tasks/useSchedule'
import { type AgreementDraft, agreementEvent, AgreementFormModal, agreementIcs, emptyAgreement } from './AgreementFormModal'

type Filter = 'all' | AgreementKind | 'history'

/** Renewal starts the day after the old end and keeps the same length. */
function renewalDraft(a: Agreement): AgreementDraft {
  const start = iso(addDays(day(a.endDate), 1))
  let months = 12
  if (a.startDate) {
    const { years, months: m } = durationParts(a.startDate, a.endDate)
    months = years * 12 + m || 12
  }
  return {
    ...emptyAgreement(),
    kind: a.kind,
    title: a.title,
    party: a.party,
    productId: a.productId,
    alertDays: a.alertDays,
    amountBaisa: a.amountBaisa,
    startDate: start,
    endDate: endAfterMonths(start, months),
  }
}

export function AgreementsPage() {
  const s = useSchedule()
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<{ draft: AgreementDraft; renewingId?: string } | null>(null)
  const data = s.data
  const products = data?.products ?? []
  const productName = (id: string | null) => {
    const p = products.find((x) => x.id === id)
    return p ? nameOf({ name: p.name, nameEn: p.nameEn ?? undefined }) : null
  }

  const all = data?.agreements ?? []
  const list = all.filter((a) => (filter === 'history' ? !a.active : a.active && (filter === 'all' || a.kind === filter)))
  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('الكل', 'All') },
    { value: 'product_permit', label: t('تصاريح المنتجات', 'Product permits') },
    { value: 'contract', label: t('العقود', 'Contracts') },
    { value: 'license', label: t('التراخيص', 'Licences') },
    { value: 'other', label: t('أخرى', 'Other') },
    { value: 'history', label: t('السابقة', 'Past') },
  ]

  const exportAll = () => openIcs(buildIcs(all.filter((a) => a.active).map(agreementEvent)), 'zawrda-agreements.ics')

  return (
    <>
      <PageHeader
        title={t('الاتفاقيات والتصاريح', 'Agreements & permits')}
        subtitle={t('العقود والتراخيص وتصاريح بيع المنتجات، مع تنبيه قبل الانتهاء.', 'Contracts, licences and product sale permits, with an alert before they expire.')}
        actions={
          <>
            <Button variant="secondary" onClick={exportAll} disabled={!all.some((a) => a.active)}>
              <CalendarPlus className="size-5" />
              {t('إضافة للتقويم', 'Add to Calendar')}
            </Button>
            <Button onClick={() => setEditing({ draft: emptyAgreement(filter !== 'all' && filter !== 'history' ? { kind: filter } : {}) })}>
              <Plus className="size-5" />
              {t('إضافة', 'Add')}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`min-h-11 rounded-full border px-4 text-sm ${filter === f.value ? 'border-brand-700 bg-brand-700 text-on-brand' : 'border-line bg-card'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {s.error && !data && <FormError message={serverError(s.error)} />}

      {!list.length ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title={s.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا يوجد شيء هنا بعد', 'Nothing here yet')}
            description={t('مثال: عقد إيجار المصنع، السجل التجاري، رخصة البلدية، الشهادة الصحية، تصريح بيع كل منتج.', 'e.g. factory lease, commercial registration, municipality licence, health certificate, a sale permit per product.')}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((a) => {
            const { status, daysLeft } = agreementStatus(a, s.todayDate)
            const tone = !a.active ? 'stone' : status === 'expired' ? 'red' : status === 'expiring' ? 'amber' : 'green'
            const bar = { stone: 'bg-line', red: 'bg-red-600', amber: 'bg-amber-500', green: 'bg-palm' }[tone]
            return (
              <Card key={a.id} className="relative overflow-hidden">
                <span className={`absolute inset-y-0 start-0 w-1.5 ${bar}`} aria-hidden />
                <button type="button" onClick={() => setEditing({ draft: a })} className="block w-full text-start">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-bold">{a.title}</div>
                      <div className="text-sm text-muted">
                        {kindLabel(a.kind)}
                        {a.kind === 'product_permit' && productName(a.productId) ? ` — ${productName(a.productId)}` : a.party ? ` — ${a.party}` : ''}
                      </div>
                    </div>
                    <Badge tone={tone}>{a.active ? daysLeftLabel(daysLeft) : t('جُدِّدت', 'Renewed')}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted">{t('تنتهي في', 'Ends')}</dt>
                      <dd className="num font-medium">{formatDate(a.endDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t('المدة', 'Length')}</dt>
                      <dd>{durationLabel(a.startDate, a.endDate) ?? '—'}</dd>
                    </div>
                  </dl>
                </button>
                {a.active && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setEditing({ draft: renewalDraft(a), renewingId: a.id })}>
                      <RefreshCw className="size-4" />
                      {t('تجديد', 'Renew')}
                    </Button>
                    <Button variant="ghost" onClick={() => openIcs(agreementIcs(a), 'zawrda-agreement.ics')}>
                      <CalendarPlus className="size-4" />
                      {t('للتقويم', 'Calendar')}
                    </Button>
                    {a.filePath && <Paperclip className="ms-auto size-4 self-center text-muted" aria-label={t('وثيقة مرفقة', 'Document attached')} />}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <AgreementFormModal initial={editing.draft} renewingId={editing.renewingId} products={products} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
