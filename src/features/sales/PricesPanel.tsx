import { Plus } from 'lucide-react'
import { useState } from 'react'
import { FormError, NumberInput, TextInput } from '../../components/form'
import { Button, Card } from '../../components/ui'
import { serverError } from '../../data/errors'
import type { ItemWithStock } from '../../data/inventory'
import { channelByName, type SalesData, setChannelPrice } from '../../data/sales'
import { baisaToInput, parseRialToBaisa } from '../../domain/money'
import { nameOf, t } from '../../i18n/index'

/**
 * Price of each product in each channel. A quotation or invoice fills the
 * price from the customer's channel (it can still be changed on the line).
 */
export function PricesPanel({ data, products }: { data: SalesData; products: ItemWithStock[] }) {
  const channels = data.channels.filter((c) => c.active)
  const price = new Map(data.prices.map((p) => [`${p.channelId}:${p.productId}`, p.priceBaisa]))
  const [newChannel, setNewChannel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const save = async (channelId: string, productId: string, text: string) => {
    const key = `${channelId}:${productId}`
    const value = text.trim() === '' ? null : parseRialToBaisa(text)
    if (text.trim() !== '' && (value == null || value < 0)) return setError(t('السعر غير صحيح.', 'Invalid price.'))
    if (value === (price.get(key) ?? null)) return
    setError(null)
    try {
      await setChannelPrice(channelId, productId, value)
      setSavedKey(key)
    } catch (e) {
      setError(serverError(e))
    }
  }

  const addChannel = async () => {
    if (!newChannel.trim()) return
    try {
      await channelByName(newChannel)
      setNewChannel('')
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <Card>
      <p className="mb-4 text-sm text-muted">
        {t('سعر العبوة لكل قناة بالريال العماني. يُحفظ السعر عند الخروج من الخانة، والخانة الفارغة تعني لا سعر.', 'Unit price per channel in OMR. Saved when you leave the box; empty means no price.')}
      </p>
      {!products.length ? (
        <p className="text-muted">{t('أضف المنتجات أولاً من صفحة المنتجات.', 'Add products first on the Products page.')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[32rem] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-start text-sm text-muted">
                <th className="pe-3 text-start font-medium">{t('المنتج', 'Product')}</th>
                {channels.map((c) => (
                  <th key={c.id} className="px-1 text-start font-medium">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="pe-3 font-medium">{nameOf(p)}</td>
                  {channels.map((c) => {
                    const key = `${c.id}:${p.id}`
                    const current = price.get(key)
                    return (
                      <td key={c.id} className="px-1">
                        <NumberInput
                          key={`${key}:${current ?? ''}`}
                          defaultValue={current == null ? '' : baisaToInput(current)}
                          onBlur={(e) => save(c.id, p.id, e.target.value)}
                          placeholder="—"
                          aria-label={`${nameOf(p)} — ${c.name}`}
                          className={savedKey === key ? '!border-palm' : ''}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <div className="min-w-48 flex-1">
          <TextInput value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder={t('اسم قناة جديدة', 'New channel name')} aria-label={t('قناة جديدة', 'New channel')} />
        </div>
        <Button variant="secondary" onClick={addChannel} disabled={!newChannel.trim()}>
          <Plus className="size-5" />
          {t('إضافة قناة', 'Add channel')}
        </Button>
      </div>
      <FormError message={error} />
    </Card>
  )
}
