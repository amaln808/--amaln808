import { nameOf, t } from '../../i18n/index'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { FormError, TextInput } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import type { ExpenseCategory } from '../../db/types'
import { deleteCategory, saveCategory } from '../../services/expenses'

const COLORS = ['#8b5cf6', '#f59e0b', '#0ea5e9', '#10b981', '#ef4444', '#ec4899', '#64748b', '#6366f1', '#a3a3a3', '#84cc16']

export function CategoriesModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: ExpenseCategory[] }) {
  const [newName, setNewName] = useState('')
  const [newNameEn, setNewNameEn] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNameEn, setEditNameEn] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const add = () =>
    run(async () => {
      await saveCategory(db, { name: newName, nameEn: newNameEn, color: COLORS[categories.length % COLORS.length] })
      setNewName('')
      setNewNameEn('')
    })

  return (
    <Modal open={open} onClose={onClose} title={t("تصنيفات المصروفات", "Expense categories")}>
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border-b border-stone-100 py-2 last:border-0">
              <span className="size-3 shrink-0 rounded-full" style={{ background: c.color ?? '#a8a29e' }} />
              {editing === c.id ? (
                <>
                  <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus dir="rtl" placeholder="عربي" />
                  <TextInput value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} dir="ltr" placeholder="English" />
                  <button
                    onClick={() => run(async () => { await saveCategory(db, { name: editName, nameEn: editNameEn }, c.id); setEditing(null) })}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-50"
                    aria-label={t("حفظ", "Save")}
                  >
                    <Check className="size-5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1">{nameOf(c)}</span>
                  <button
                    onClick={() => { setEditing(c.id); setEditName(c.name); setEditNameEn(c.nameEn ?? '') }}
                    className="flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                    aria-label={t(`تعديل ${c.name}`, `Edit ${c.name}`)}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => run(() => deleteCategory(db, c.id))}
                    className="flex size-11 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={t(`حذف ${c.name}`, `Delete ${c.name}`)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("اسم تصنيف جديد", "New category (Arabic)")} dir="rtl" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <TextInput value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} placeholder={t("الاسم بالإنجليزية", "English name")} dir="ltr" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button onClick={add} disabled={!newName.trim()}>{t("إضافة", "Add")}</Button>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
