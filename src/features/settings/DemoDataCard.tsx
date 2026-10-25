import { Database, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Field, FormError, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button, Card } from '../../components/ui'
import { serverError } from '../../data/errors'
import { loadDemoData, resetAllData } from '../../data/inventory'
import { t } from '../../i18n/index'
import { SectionTitle } from './SectionTitle'

/** Load the pretend factory for practice, and wipe everything before going live. */
export function DemoDataCard() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [word, setWord] = useState('')
  const WORD = t('حذف', 'DELETE')

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await fn()
      setDone(ok)
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <SectionTitle
        note={t(
          'للتجربة قبل البدء الفعلي: موردون وأصناف بتواريخ انتهاء مختلفة ومنتجان ووصفات ومشتريات ودفعتا إنتاج وعملاء وأسعار وعروض وفواتير. يُمسح كل شيء بعدها بزر واحد.',
          'Practice before going live: suppliers, items with different expiry dates, two products, recipes, purchases, two batches, customers, prices, quotations and invoices. Wipe it all with one button afterwards.',
        )}
      >
        {t('البيانات التجريبية', 'Demo data')}
      </SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => run(loadDemoData, t('تم تحميل المصنع الوهمي.', 'Demo factory loaded.'))}>
          <Database className="size-5" />
          {t('تحميل بيانات المصنع الوهمي', 'Load the demo factory')}
        </Button>
        <Button variant="ghost" className="text-red-700" disabled={busy} onClick={() => (setWord(''), setConfirming(true))}>
          <Trash2 className="size-5" />
          {t('مسح كل البيانات', 'Clear all data')}
        </Button>
      </div>
      {done && <p className="mt-3 text-sm text-palm">{done}</p>}
      <FormError message={error} />

      {confirming && (
        <Modal
          open
          onClose={() => setConfirming(false)}
          title={t('مسح كل البيانات', 'Clear all data')}
          footer={
            <Button
              className="flex-1 !bg-red-700 !text-white"
              disabled={word.trim() !== WORD || busy}
              onClick={async () => {
                setConfirming(false)
                await run(resetAllData, t('تم مسح كل البيانات. التطبيق جاهز للبيانات الحقيقية.', 'All data cleared. Ready for real data.'))
              }}
            >
              {t('مسح نهائي', 'Delete permanently')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="leading-relaxed">
              {t(
                'سيُحذف كل شيء: الأصناف، الموردون، المشتريات، الإنتاج، المهام، الاتفاقيات… ولا يمكن التراجع. تبقى الإعدادات والحساب وسجل التعديلات.',
                'Everything will be deleted — items, suppliers, purchases, production, tasks, agreements… This cannot be undone. Settings, your account and the change history stay.',
              )}
            </p>
            <Field label={t(`للتأكيد تُكتب كلمة: ${WORD}`, `To confirm, type: ${WORD}`)}>
              <TextInput value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="characters" />
            </Field>
          </div>
        </Modal>
      )}
    </Card>
  )
}
