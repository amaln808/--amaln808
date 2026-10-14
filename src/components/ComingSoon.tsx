import { Hammer } from 'lucide-react'
import { ar } from '../i18n/ar'
import { Card, EmptyState, PageHeader } from './ui'

export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={Hammer} title={ar.common.comingSoon} description={ar.common.phase(phase)} />
      </Card>
    </>
  )
}
