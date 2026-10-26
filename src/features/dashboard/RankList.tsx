import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'

export interface RankRow {
  key: string
  label: ReactNode
  value: number
  display: ReactNode
  sub?: ReactNode
  color?: string
  to?: string
}

/** Ranked list with thin horizontal bars (one color unless rows carry their own identity color). */
export function RankList({ title, rows, empty, color = 'var(--viz-in)' }: { title: string; rows: RankRow[]; empty: string; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <Card>
      <h2 className="mb-3 font-bold">{title}</h2>
      {!rows.length && <p className="text-sm text-muted">{empty}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const body = (
            <>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {r.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />}
                  <span className="truncate">{r.label}</span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="num font-bold">{r.display}</span>
                  {r.sub && <span className="ms-2 text-xs text-muted">{r.sub}</span>}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ground">
                <div className="h-full rounded-full" style={{ width: `${(Math.max(r.value, 0) / max) * 100}%`, background: r.color ?? color }} />
              </div>
            </>
          )
          return <li key={r.key}>{r.to ? <Link to={r.to} className="block rounded-lg hover:bg-brand-50">{body}</Link> : body}</li>
        })}
      </ul>
    </Card>
  )
}
