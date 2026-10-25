import { FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSettingsQuery } from '../../app/settingsContext'
import { Badge, Button, Card } from '../../components/ui'
import { fetchQualityChecks, QUALITY_KEY, type QualityCheck } from '../../data/quality'
import { useQuery } from '../../data/useQuery'
import { overLimit } from '../../domain/quality'
import { t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'
import { RESULT_TONE, resultLabel } from './labels'
import { QualityCheckModal } from './QualityCheckModal'

/** The lab checks of one production batch, newest first, with add / edit. */
export function BatchQualityCard({ batchId, batchNo }: { batchId: string; batchNo: string }) {
  const checks = useQuery(QUALITY_KEY, fetchQualityChecks)
  const settings = useSettingsQuery().data
  const mine = (checks.data ?? []).filter((c) => c.batchId === batchId)
  const [editing, setEditing] = useState<QualityCheck | 'new' | null>(null)

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <h2 className="text-lg font-bold">{t('فحوص الجودة', 'Quality checks')}</h2>
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus className="size-5" />
          {t('تسجيل فحص', 'Record a check')}
        </Button>
      </div>
      {mine.length === 0 ? (
        <p className="px-5 pb-4 pt-2 text-sm text-muted">
          {t('لا يوجد فحص بعد. الدفعة لا تُباع حتى يُسجَّل فحص بنتيجة «مقبولة».', 'No check yet. The batch cannot be sold until a check is recorded as «pass».')}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {mine.map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => setEditing(c)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-start hover:bg-brand-50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={RESULT_TONE[c.result]}>{resultLabel(c.result)}</Badge>
                    <span className="font-medium">{formatDate(c.checkDate)}</span>
                    {i === 0 && mine.length > 1 && <span className="text-xs text-muted">{t('الأحدث', 'latest')}</span>}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {[c.labName, c.notes].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Value label={t('الرطوبة', 'Moisture')} value={c.moisturePct} unit="%" over={overLimit(c.moisturePct, settings?.maxMoisturePct)} />
                <Value label={t('الأفلاتوكسين', 'Aflatoxin')} value={c.aflatoxinPpb} unit="ppb" over={overLimit(c.aflatoxinPpb, settings?.maxAflatoxinPpb)} />
                {c.certificatePath && <FileText className="size-5 text-muted" aria-label={t('شهادة مرفقة', 'Certificate attached')} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <QualityCheckModal
          batchId={batchId}
          batchNo={batchNo}
          check={editing === 'new' ? undefined : editing}
          settings={settings}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function Value({ label, value, unit, over }: { label: string; value: string | null; unit: string; over: boolean }) {
  if (value == null) return null
  return (
    <div className="text-end">
      <div className="text-xs text-muted">{label}</div>
      <div className={`num font-bold ${over ? 'text-red-700' : ''}`} dir="ltr">
        {Number(value)} {unit}
      </div>
    </div>
  )
}
