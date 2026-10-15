import { t } from '../i18n/index'
import { useCallback, useRef, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './ui'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

/** Promise-based confirmation dialog. Render `dialog` once in the component. */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(ok: boolean) => void>(undefined)

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (ok: boolean) => {
    resolver.current?.(ok)
    setOpts(null)
  }

  const dialog = (
    <Modal
      open={!!opts}
      onClose={() => close(false)}
      title={opts?.title ?? ''}
      footer={
        <>
          <Button className={`flex-1 ${opts?.danger ? '!bg-red-600 hover:!bg-red-700' : ''}`} onClick={() => close(true)}>
            {opts?.confirmLabel ?? t("تأكيد", "Confirm")}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => close(false)}>
            {t("إلغاء", "Cancel")}
          </Button>
        </>
      }
    >
      <p className="whitespace-pre-line text-stone-700">{opts?.message}</p>
    </Modal>
  )

  return { confirm, dialog }
}
