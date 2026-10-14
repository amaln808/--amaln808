import { DatabaseBackup, HardDrive } from 'lucide-react'
import type { ReactNode } from 'react'
import { isBackupOverdue, usePersistentStorage } from '../../app/storage'
import { useSettings } from '../../app/useSettings'
import { Badge, Card, PageHeader } from '../../components/ui'
import { ar } from '../../i18n/ar'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-3 last:border-0">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  const persist = usePersistentStorage()

  return (
    <>
      <PageHeader title={ar.nav.settings} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-bold">{ar.settings.business}</h2>
          <Row label={ar.settings.businessName}>{settings?.businessName}</Row>
          <Row label={ar.settings.currency}>{ar.settings.currencyValue}</Row>
          <Row label={ar.settings.vat}>
            <span className="num">{settings?.vatRatePercent ?? 0}%</span>
          </Row>
          <p className="mt-2 text-sm text-stone-500">{ar.settings.vatNote}</p>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <HardDrive className="size-5" /> {ar.storage.title}
          </h2>
          <p className="text-sm">
            {persist === 'persisted' && ar.storage.persisted}
            {persist === 'not-persisted' && ar.storage.notPersisted}
            {persist === 'unknown' && ar.storage.unknown}
          </p>
          <h3 className="mb-2 mt-5 flex items-center gap-2 font-bold">
            <DatabaseBackup className="size-5" /> النسخ الاحتياطي
          </h3>
          {settings && isBackupOverdue(settings.lastBackupAt) && (
            <Badge tone="amber">{settings.lastBackupAt ? ar.backup.reminder : ar.backup.never}</Badge>
          )}
          <p className="mt-2 text-sm text-stone-500">{ar.backup.exportSoon}</p>
        </Card>
      </div>
    </>
  )
}
