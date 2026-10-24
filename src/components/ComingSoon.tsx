import { Hammer } from 'lucide-react'
import { t } from '../i18n/index'
import { Card, EmptyState, PageHeader } from './ui'

export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState
          icon={Hammer}
          title={t('قيد البناء', 'Being built')}
          description={t(`ستتوفر هذه الوحدة في الجولة ${phase} من البناء.`, `This module arrives in build round ${phase}.`)}
        />
      </Card>
    </>
  )
}
