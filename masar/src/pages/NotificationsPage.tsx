import { useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { noticesFor } from '../domain/alerts'
import { Empty, PageHead } from '../components/ui'
import { NoticeRow } from './DashboardPage'

export function NotificationsPage() {
  const me = useMe()
  const { db, today, dismiss } = useStore()
  const { t } = usePrefs()
  const all = noticesFor(db, me, today)
  const open = all.filter((n) => !db.readNotices.includes(n.id))
  const read = all.filter((n) => db.readNotices.includes(n.id))
  return (
    <>
      <PageHead title={t('الإشعارات', 'Notifications')} sub={t('مواعيد التقييم، والأهداف المتأخرة، وما ينتهي قريباً', 'Review deadlines, goals behind, and what ends soon')} />
      {open.length ? (
        <ul className="grid gap-2">
          {open.map((n) => (
            <NoticeRow key={n.id} n={n} onDismiss={() => dismiss(n.id)} />
          ))}
        </ul>
      ) : (
        <Empty>{t('لا إشعارات جديدة.', 'No new notifications.')}</Empty>
      )}
      {read.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 font-bold text-muted">{t('تمت قراءتها', 'Read')}</h2>
          <ul className="grid gap-2 opacity-70">
            {read.map((n) => (
              <NoticeRow key={n.id} n={n} />
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 text-sm text-muted">
        {t(
          'تُحسب الإشعارات من البيانات مباشرة، فتختفي وحدها عند إنجاز التقييم أو تحسن الهدف. إشعارات الجوال والبريد تأتي مع مرحلة قاعدة البيانات.',
          'Notifications are worked out from the data, so they clear themselves once a review is done or a goal recovers. Phone and email alerts arrive with the database phase.',
        )}
      </p>
    </>
  )
}
