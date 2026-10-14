import { useEffect, useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import type { Expense, ExpenseCategory, PaymentMethod } from '../../db/types'
import { baisaToInput, parseRialToBaisa } from '../../domain/money'
import { ar } from '../../i18n/ar'
import { deleteExpense, saveExpense } from '../../services/expenses'

export function ExpenseFormModal({
  open,
  onClose,
  expense,
  categories,
}: {
  open: boolean
  onClose: () => void
  expense?: Expense
  categories: ExpenseCategory[]
}) {
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCategoryId(expense?.categoryId ?? '')
    setDate(expense?.date ?? today())
    setAmount(expense ? baisaToInput(expense.amountBaisa) : '')
    setMethod(expense?.method ?? 'cash')
    setDescription(expense?.description ?? '')
    setError(null)
  }, [open, expense])

  const save = async (asNew = false) => {
    const amountBaisa = parseRialToBaisa(amount)
    if (!amountBaisa || amountBaisa <= 0) return setError('أدخل مبلغاً صحيحاً')
    try {
      await saveExpense(db, { categoryId, date, amountBaisa, method, description }, asNew ? undefined : expense?.id)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const remove = async () => {
    if (!expense) return
    await deleteExpense(db, expense.id)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'تعديل المصروف' : 'مصروف جديد'}
      footer={
        <>
          <Button className="flex-1" onClick={() => save()}>حفظ</Button>
          {expense ? (
            <Button variant="secondary" className="flex-1" onClick={() => save(true)} title="يحفظ نسخة جديدة بنفس البيانات — مفيد للمصروفات الشهرية المتكررة">
              حفظ كمصروف جديد
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1" onClick={onClose}>إلغاء</Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="التصنيف">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition ${
                  categoryId === c.id ? 'border-brand-700 bg-brand-50 font-bold text-brand-800' : 'border-stone-300 bg-white'
                }`}
              >
                <span className="size-2.5 rounded-full" style={{ background: c.color ?? '#a8a29e' }} />
                {c.name}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المبلغ">
            <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} suffix="ر.ع" placeholder="0.000" />
          </Field>
          <Field label="التاريخ">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="طريقة الدفع">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(ar.paymentMethods) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>{ar.paymentMethods[m]}</option>
            ))}
          </Select>
        </Field>
        <Field label="الوصف (اختياري)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: إيجار شهر أكتوبر" />
        </Field>
        <FormError message={error} />
        {expense && (
          <button type="button" onClick={remove} className="self-start text-sm text-red-700 underline-offset-4 hover:underline">
            حذف هذا المصروف
          </button>
        )}
      </div>
    </Modal>
  )
}
