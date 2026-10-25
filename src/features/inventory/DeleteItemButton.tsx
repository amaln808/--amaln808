import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { deleteItem } from '../../data/inventory'
import { t } from '../../i18n/index'

/** «حذف» for a product or material, then back to its list. */
export function DeleteItemButton({ id, name, backTo, onError }: { id: string; name: string; backTo: string; onError: (msg: string) => void }) {
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    const ok = await confirm({
      title: t(`حذف «${name}»`, `Delete «${name}»`),
      message: t(
        'يُحذف من القوائم. إذا كان له سجل سابق (مخزون أو مشتريات أو إنتاج أو مبيعات) يُخفى فقط وتبقى سجلاته محفوظة، ويمكن إعادته من «الأصناف الموقوفة».',
        'It leaves the lists. If it has history (stock, purchases, production or sales) it is only hidden and its records stay; it can be brought back from «Inactive items».',
      ),
      confirmLabel: t('حذف', 'Delete'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await deleteItem(id)
      navigate(backTo, { replace: true })
    } catch (e) {
      onError(serverError(e))
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="secondary" className="!border-red-300 !text-red-700" onClick={remove} disabled={busy}>
        <Trash2 className="size-4" />
        {t('حذف', 'Delete')}
      </Button>
      {dialog}
    </>
  )
}
