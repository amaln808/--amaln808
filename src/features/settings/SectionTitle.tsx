import type { ReactNode } from 'react'

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold">{children}</h2>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
    </div>
  )
}
