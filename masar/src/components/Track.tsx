import { Link } from 'react-router-dom'
import type { Goal } from '../domain/types'
import { expectedProgress, goalProgress, weightedAchievement, weightedExpected } from '../domain/goals'
import { usePrefs } from '../i18n'

/**
 * «المسار» — the app's signature. One person's year as a ruler: each goal is a segment whose
 * width is its weight and whose fill is its progress; a needle in each segment marks where it should be by today.
 */
export function Track({ goals, today, compact = false, label }: { goals: Goal[]; today: string; compact?: boolean; label?: string }) {
  const { t, pct } = usePrefs()
  const live = goals.filter((g) => g.status !== 'cancelled')
  const total = live.reduce((s, g) => s + g.weight, 0) || 1
  const ach = weightedAchievement(live, today)
  const exp = weightedExpected(live, today)
  if (!live.length) return <div className="text-sm text-muted">{t('لا أهداف بعد', 'No goals yet')}</div>
  return (
    <div>
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{label ?? t('مسار السنة', 'The year’s track')}</span>
          <span className="num text-muted">
            {t('المنجز', 'Done')} <b className="text-ink">{pct(ach)}</b> · {t('المتوقع اليوم', 'Expected today')} {pct(exp)}
          </span>
        </div>
      )}
      <div role="img" aria-label={`${t('المنجز', 'Done')} ${pct(ach)}, ${t('المتوقع', 'expected')} ${pct(exp)}`}>
        <div className={`flex gap-[2px] ${compact ? 'h-3' : 'h-7'}`}>
          {live.map((g) => {
            const p = goalProgress(g, today)
            const e = expectedProgress(g, today)
            return (
              <Link
                key={g.id}
                to={`/goals/${g.id}`}
                title={`${g.title} — ${pct(p)} (${t('الوزن', 'weight')} ${g.weight}%)`}
                className="relative overflow-hidden rounded-[4px] bg-track-empty"
                style={{ flexGrow: g.weight, flexBasis: 0 }}
              >
                <span className="absolute inset-y-0 start-0 bg-track" style={{ width: `${p * 100}%` }} />
                {g.status === 'active' && e > 0 && e < 1 && (
                  <span className="absolute inset-y-0 z-20 w-[2px] bg-ink" style={{ insetInlineStart: `calc(${e * 100}% - 1px)` }} />
                )}
                {!compact && g.weight / total > 0.14 && (
                  <span className="relative z-10 block truncate px-1.5 text-[0.7rem] leading-7 font-medium text-ink mix-blend-normal">
                    <span className="rounded bg-card/80 px-1">{g.title}</span>
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
      {!compact && <div className="ticks mt-1 h-1.5" aria-hidden />}
    </div>
  )
}
