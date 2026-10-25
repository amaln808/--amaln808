import { ChevronLeft, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { FormError } from '../../components/form'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { fetchBatches, PRODUCTION_KEY } from '../../data/production'
import { fetchQualityChecks, QUALITY_KEY } from '../../data/quality'
import { useQuery } from '../../data/useQuery'
import { overLimit } from '../../domain/quality'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { QC_TONE, qcLabel } from '../inventory/labels'
import { formatDate } from '../tasks/labels'
import { QualityCheckModal } from './QualityCheckModal'

type Batch = Awaited<ReturnType<typeof fetchBatches>>[number]

/** Every production batch by quality status: waiting first, then rejected, then released. */
export function QualityPage() {
  const batches = useQuery(PRODUCTION_KEY, fetchBatches)
  const checks = useQuery(QUALITY_KEY, fetchQualityChecks)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const settings = useSettingsQuery().data
  const byId = new Map((items.data ?? []).map((i) => [i.id, i]))
  const latest = new Map<string, NonNullable<typeof checks.data>[number]>()
  for (const c of checks.data ?? []) if (!latest.has(c.batchId)) latest.set(c.batchId, c)
  const [checking, setChecking] = useState<Batch | null>(null)

  const all = batches.data ?? []
  const groups = [
    { status: 'pending', title: t('بانتظار الفحص', 'Awaiting check'), list: all.filter((b) => b.qcStatus === 'pending') },
    { status: 'failed', title: t('مرفوضة — لا تُباع', 'Rejected — not for sale'), list: all.filter((b) => b.qcStatus === 'failed') },
    { status: 'passed', title: t('مُصرَّح بيعها', 'Released for sale'), list: all.filter((b) => b.qcStatus === 'passed') },
  ] as const

  return (
    <>
      <PageHeader
        title={t('الجودة', 'Quality')}
        subtitle={t('لا يُباع أي منتج إلا من دفعة فحصها «مقبول» وبتصريح بيع ساري.', 'Only batches checked «pass», with a valid sale permit, can be sold.')}
      />
      {batches.error && !batches.data && <FormError message={serverError(batches.error)} />}
      {settings && !settings.maxMoisturePct && !settings.maxAflatoxinPpb && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('لم تُضبط حدود الرطوبة والأفلاتوكسين بعد. تُضاف من الإعدادات ← المبيعات والجودة، فيُلوَّن أي فحص يتجاوزها.', 'Moisture and aflatoxin limits are not set. Add them in Settings → Sales & quality to highlight checks above them.')}
          {' '}
          <Link to="/settings" className="font-bold underline">{t('الإعدادات', 'Settings')}</Link>
        </p>
      )}
      {!all.length ? (
        <Card>
          <EmptyState icon={ClipboardCheck} title={batches.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد دفعات إنتاج بعد', 'No production batches yet')} />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(
            (g) =>
              g.list.length > 0 && (
                <Card key={g.status} className="p-0">
                  <h2 className="flex items-center gap-2 px-5 pt-4 text-lg font-bold">
                    {g.title}
                    <Badge tone={QC_TONE[g.status]}>{g.list.length}</Badge>
                  </h2>
                  <ul className="mt-2 divide-y divide-line">
                    {g.list.map((b) => {
                      const c = latest.get(b.id)
                      const over = c && (overLimit(c.moisturePct, settings?.maxMoisturePct) || overLimit(c.aflatoxinPpb, settings?.maxAflatoxinPpb))
                      return (
                        <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                          <Link to={`/production/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-brand-800">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold" dir="ltr">{b.batchNo}</span>
                                <span>{nameOf(byId.get(b.productId))}</span>
                              </div>
                              <div className="mt-1 text-sm text-muted">
                                {t(`أُنتجت ${formatDate(b.productionDate)}`, `Made ${formatDate(b.productionDate)}`)} · {formatQty(b.remaining)} {t('متبقية', 'left')}
                                {c && (
                                  <>
                                    {' · '}
                                    <span className={over ? 'font-bold text-red-700' : undefined}>
                                      {t(`آخر فحص ${formatDate(c.checkDate)}`, `last check ${formatDate(c.checkDate)}`)}
                                      {over ? t(' — قيمة فوق الحد', ' — value above limit') : ''}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <Badge tone={QC_TONE[g.status]}>{qcLabel(g.status)}</Badge>
                            <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                          </Link>
                          {g.status === 'pending' && (
                            <Button variant="secondary" onClick={() => setChecking(b)}>
                              {t('تسجيل فحص', 'Record check')}
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              ),
          )}
        </div>
      )}
      {checking && (
        <QualityCheckModal batchId={checking.id} batchNo={checking.batchNo} settings={settings} onClose={() => setChecking(null)} />
      )}
    </>
  )
}
