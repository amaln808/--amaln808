import { useLiveQuery } from 'dexie-react-hooks'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button, Card } from '../../components/ui'
import { local } from '../../data/local'
import { discardEntry, flushOutbox, retryFailed } from '../../data/outbox'
import { t } from '../../i18n/index'
import { SectionTitle } from './SectionTitle'

/** Changes made offline that the server refused; shown only when there are some. */
export function PendingChangesCard() {
  const failed = useLiveQuery(() => local.outbox.where('status').equals('failed').sortBy('createdAt'), []) ?? []
  if (!failed.length) return null
  return (
    <Card className="border-red-200">
      <SectionTitle
        note={t(
          'سُجّلت هذه العمليات دون اتصال، ثم رفضها الخادم. يمكن إعادة المحاولة أو حذفها.',
          'These were recorded offline and then refused by the server. Retry or discard them.',
        )}
      >
        {t('عمليات لم تُحفظ', 'Changes not saved')}
      </SectionTitle>
      <ul className="flex flex-col divide-y divide-line">
        {failed.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{e.op}</div>
              <div className="text-sm text-red-700">{e.lastError}</div>
              <div className="num text-xs text-muted">{new Date(e.createdAt).toLocaleString()}</div>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                await retryFailed(e.id)
                await flushOutbox()
              }}
            >
              <RotateCcw className="size-4" />
              {t('إعادة المحاولة', 'Retry')}
            </Button>
            <Button variant="ghost" onClick={() => discardEntry(e.id)} aria-label={t('حذف', 'Discard')}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
