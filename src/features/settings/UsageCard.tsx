import { FormError } from '../../components/form'
import { Card } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchStorageUsage, FREE_DB_BYTES, FREE_FILES_BYTES } from '../../data/settings'
import { useQuery } from '../../data/useQuery'
import { t } from '../../i18n/index'
import { SectionTitle } from './SectionTitle'

/** Warn once the free plan is this full. */
export const USAGE_WARN_RATIO = 0.7

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = Math.min(1, used / limit)
  const warn = ratio >= USAGE_WARN_RATIO
  return (
    <div>
      <div className="mb-1.5 flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="num text-muted" dir="ltr">
          {formatBytes(used)} / {formatBytes(limit)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-brand-100" role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${warn ? 'bg-red-600' : 'bg-palm'}`} style={{ width: `${Math.max(ratio * 100, 1)}%` }} />
      </div>
    </div>
  )
}

export function UsageCard() {
  const q = useQuery('usage', fetchStorageUsage)
  const u = q.data
  const warn = u && (u.dbBytes / FREE_DB_BYTES >= USAGE_WARN_RATIO || u.filesBytes / FREE_FILES_BYTES >= USAGE_WARN_RATIO)
  return (
    <Card>
      <SectionTitle note={t('حدود الخطة المجانية في Supabase.', 'Supabase free plan limits.')}>
        {t('المساحة المستخدمة', 'Space used')}
      </SectionTitle>
      {u ? (
        <div className="flex flex-col gap-4">
          <Meter label={t('البيانات', 'Data')} used={u.dbBytes} limit={FREE_DB_BYTES} />
          <Meter label={t(`الصور والملفات (${u.filesCount})`, `Photos & files (${u.filesCount})`)} used={u.filesBytes} limit={FREE_FILES_BYTES} />
          {warn && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {t(
                'تجاوزت المساحة 70% من الحد المجاني. يُنصح بأخذ نسخة احتياطية ومراجعة الصور القديمة.',
                'Over 70% of the free limit. Take a backup and review old photos.',
              )}
            </p>
          )}
        </div>
      ) : q.error ? (
        <FormError message={serverError(q.error)} />
      ) : (
        <p className="text-muted">{t('جارٍ الحساب…', 'Measuring…')}</p>
      )}
    </Card>
  )
}
