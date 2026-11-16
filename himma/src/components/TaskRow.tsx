import { useState } from 'react'
import { Check, Star } from 'lucide-react'
import { errorText } from '../data/client'
import { useStore, type Done, type Task } from '../data/store'
import { repeatText, shortDate } from '../format'
import { Button, ErrorText, Modal, ScopeTag, inputClass } from './ui'

export function TaskRow({
  task,
  date,
  done,
  overdue,
  showDate,
  onEdit,
}: {
  task: Task
  date: string
  done?: Done
  overdue?: boolean
  showDate?: boolean
  onEdit: () => void
}) {
  const store = useStore()
  const [error, setError] = useState('')
  const [noting, setNoting] = useState(false)
  async function toggle() {
    setError('')
    try {
      await store.setDone(task, date, !done)
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <li className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!!done}
        aria-label={done ? `إلغاء إنجاز: ${task.title}` : `تم: ${task.title}`}
        className={`grid size-11 shrink-0 place-items-center rounded-full border-2 transition-colors ${
          done ? 'border-good bg-good text-card' : overdue ? 'border-late text-transparent hover:text-late' : 'border-line text-transparent hover:border-button hover:text-button'
        }`}
      >
        <Check size={22} strokeWidth={3} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className="block w-full text-start">
          <span className={`flex items-center gap-1.5 font-medium ${done ? 'text-muted line-through decoration-1' : ''}`}>
            {task.important && <Star size={15} className="shrink-0 fill-saffron text-saffron" aria-label="مهمة" />}
            {task.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <ScopeTag scope={task.scope} />
            {task.category && <span>{task.category}</span>}
            {task.dueTime && <span className="num">{task.dueTime}</span>}
            <span>{repeatText(task)}</span>
            {(showDate || overdue) && !(task.recurrence === 'once' && !overdue) && <span className={overdue ? 'font-medium text-late' : ''}>{overdue ? (task.recurrence === 'once' ? 'فاتت' : `فاتت: ${shortDate(date)}`) : shortDate(date)}</span>}
          </span>
        </button>
        {done && (
          <button type="button" onClick={() => setNoting(true)} className="mt-1 block min-h-8 text-start text-sm text-muted hover:text-ink">
            {done.note ? <span className="text-ink">«{done.note}»</span> : '+ أضيفي ما أنجزتِه'}
          </button>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
      {noting && done && <NoteModal done={done} title={task.title} onClose={() => setNoting(false)} />}
    </li>
  )
}

function NoteModal({ done, title, onClose }: { done: Done; title: string; onClose: () => void }) {
  const store = useStore()
  const [note, setNote] = useState(done.note ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await store.setDoneNote(done, note)
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">ماذا أنجزتِ؟ تظهر الملاحظة في سجل الإنجازات.</span>
        <textarea autoFocus className={`${inputClass} min-h-28 py-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: اتفقت مع الصيدلية على 200 علبة" />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 flex gap-2">
        <Button onClick={save} disabled={busy || done.id.startsWith('tmp-')}>
          حفظ الملاحظة
        </Button>
        <Button kind="quiet" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </Modal>
  )
}
