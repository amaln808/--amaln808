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
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
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
      await saveCategory(db, { name: newName, color: COLORS[categories.length % COLORS.length] })
      setNewName('')
    })

  return (
    <Modal open={open} onClose={onClose} title="تصنيفات المصروفات">
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border-b border-stone-100 py-2 last:border-0">
              <span className="size-3 shrink-0 rounded-full" style={{ background: c.color ?? '#a8a29e' }} />
              {editing === c.id ? (
                <>
                  <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <button
                    onClick={() => run(async () => { await saveCategory(db, { name: editName }, c.id); setEditing(null) })}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-50"
                    aria-label="حفظ"
                  >
                    <Check className="size-5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1">{c.name}</span>
                  <button
                    onClick={() => { setEditing(c.id); setEditName(c.name) }}
                    className="flex size-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                    aria-label={`تعديل ${c.name}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => run(() => deleteCategory(db, c.id))}
                    className="flex size-11 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`حذف ${c.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم تصنيف جديد" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button onClick={add} disabled={!newName.trim()}>إضافة</Button>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
