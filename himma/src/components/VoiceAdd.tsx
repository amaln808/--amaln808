import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Plus, Square } from 'lucide-react'
import { errorText } from '../data/client'
import { useStore, useToday, type Task } from '../data/store'
import { parseTask } from '../domain/voice'
import type { Scope } from '../domain/performance'
import { repeatText } from '../format'
import { useScopeFilter } from './scope'
import { TaskForm } from './TaskForm'
import { Button, ErrorText, Modal, Segmented, inputClass } from './ui'

const Recognition: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': 'الميكروفون غير مسموح. في الآيفون: الإعدادات ← التطبيقات ← Safari ← الميكروفون ← «سماح»، ثم حاولي مرة أخرى.',
  'service-not-allowed': 'التعرف على الكلام متوقف. فعّليه من: الإعدادات ← عام ← لوحة المفاتيح ← «تفعيل الإملاء»، أو اكتبي المهمة بميكروفون لوحة المفاتيح.',
  'no-speech': 'لم أسمع شيئاً. اضغطي الميكروفون وتحدثي.',
  'audio-capture': 'لم أصل إلى الميكروفون. تأكدي أنه لا يستعمله تطبيق آخر.',
  network: 'التعرف على الكلام يحتاج اتصالاً بالإنترنت.',
}

/** The iPhone/iPad speech recognition (Siri dictation), Arabic. */
function useSpeech(onText: (text: string) => void) {
  const rec = useRef<any>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')

  // Must run inside the tap itself: Safari only opens the microphone for a user action
  function start() {
    if (!Recognition) return false
    setError('')
    try {
      rec.current?.abort()
      const r = new Recognition()
      r.lang = 'ar-SA'
      r.interimResults = true
      r.continuous = false
      r.maxAlternatives = 1
      r.onresult = (e: any) => {
        let text = ''
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
        onText(text.trim())
      }
      r.onerror = (e: any) => {
        if (e.error !== 'aborted') setError(SPEECH_ERRORS[e.error] ?? 'تعذّر سماع الصوت. حاولي مرة أخرى أو اكتبي المهمة.')
      }
      r.onend = () => setListening(false)
      r.start()
      rec.current = r
      setListening(true)
      return true
    } catch {
      setListening(false)
      return false
    }
  }
  function stop() {
    rec.current?.stop()
  }
  useEffect(() => () => rec.current?.abort(), [])
  return { supported: Boolean(Recognition), listening, error, start, stop }
}

/** Floating microphone (and +) on every page: say the task, check it, save. */
export function VoiceAdd() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [form, setForm] = useState<Partial<Task> | null>(null)
  const speech = useSpeech(setText)

  // a sentence sent from Siri or the share sheet opens straight in the review window
  useEffect(() => {
    const added = sessionStorage.getItem('himma-add')
    if (!added) return
    sessionStorage.removeItem('himma-add')
    setText(added)
    setOpen(true)
  }, [])

  function openAndListen() {
    setText('')
    speech.start()
    setOpen(true)
  }

  return (
    <>
      <div className="fixed bottom-20 end-4 z-10 flex items-center gap-3 md:bottom-8 md:end-8">
        <button
          type="button"
          onClick={() => setForm({})}
          aria-label="مهمة جديدة بالكتابة"
          className="grid size-12 place-items-center rounded-full border border-line bg-card text-ink shadow-md hover:bg-brand-soft"
        >
          <Plus size={22} />
        </button>
        <button
          type="button"
          onClick={openAndListen}
          aria-label="مهمة جديدة بالصوت"
          className="grid size-16 place-items-center rounded-full bg-button text-on-brand shadow-lg hover:opacity-90"
        >
          <Mic size={28} />
        </button>
      </div>

      {open && (
        <VoiceSheet
          text={text}
          setText={setText}
          speech={speech}
          onClose={() => {
            speech.stop()
            setOpen(false)
          }}
          onDetails={(t) => {
            speech.stop()
            setOpen(false)
            setForm(t)
          }}
        />
      )}
      {form && <TaskForm defaults={form} onClose={() => setForm(null)} />}
    </>
  )
}

function VoiceSheet({
  text,
  setText,
  speech,
  onClose,
  onDetails,
}: {
  text: string
  setText: (s: string) => void
  speech: ReturnType<typeof useSpeech>
  onClose: () => void
  onDetails: (t: Partial<Task>) => void
}) {
  const store = useStore()
  const today = useToday()
  const [filter] = useScopeFilter()
  const parsed = useMemo(() => parseTask(text, today), [text, today])
  const [scope, setScope] = useState<Scope>(filter === 'personal' ? 'personal' : 'work')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const typed = useRef<HTMLTextAreaElement>(null)

  // what was said decides work/personal when it says so
  useEffect(() => {
    if (parsed.scope) setScope(parsed.scope)
  }, [parsed.scope])
  // without speech recognition, the keyboard (with its own microphone) is the way in
  useEffect(() => {
    if (!speech.supported) typed.current?.focus()
  }, [speech.supported])

  const task: Partial<Task> = {
    title: parsed.title,
    scope,
    important: parsed.important,
    recurrence: parsed.recurrence,
    intervalN: parsed.intervalN,
    weekdays: parsed.weekdays,
    startDate: parsed.startDate,
    dueTime: parsed.dueTime,
  }

  async function save() {
    if (!parsed.title) return setError('لم يبقَ اسم للمهمة. قوليها مرة أخرى أو اكتبيها.')
    setBusy(true)
    setError('')
    try {
      await store.saveTask({ ...task, category: null, endDate: null, notes: null })
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="مهمة جديدة" onClose={onClose}>
      {speech.supported && (
        <div className="flex flex-col items-center gap-2 pb-4">
          <button
            type="button"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            aria-label={speech.listening ? 'إيقاف الاستماع' : 'ابدئي الكلام'}
            className={`relative grid size-20 place-items-center rounded-full text-on-brand ${speech.listening ? 'bg-late' : 'bg-button'}`}
          >
            {speech.listening && <span className="absolute inset-0 animate-ping rounded-full bg-late/40" aria-hidden />}
            {speech.listening ? <Square size={26} className="relative" /> : <Mic size={32} />}
          </button>
          <p className="text-sm text-muted" aria-live="polite">
            {speech.listening ? 'أسمعكِ… قولي المهمة ومتى' : text ? 'اضغطي الميكروفون لإعادة الكلام' : 'اضغطي الميكروفون وتحدثي'}
          </p>
        </div>
      )}
      <ErrorText>{speech.error}</ErrorText>

      <label className="mt-2 block">
        <span className="mb-1 block text-sm text-muted">
          {speech.supported ? 'ما سمعتُه (يمكنكِ تصحيحه):' : 'اكتبي المهمة، أو اضغطي ميكروفون لوحة المفاتيح وتحدثي:'}
        </span>
        <textarea
          ref={typed}
          className={`${inputClass} min-h-20 py-2 text-lg`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="مثال: متابعة صيدلية الشفاء كل أحد الساعة 9 صباحاً، مهمة"
        />
      </label>

      {text.trim() && (
        <div className="mt-4 rounded-2xl border border-line bg-ground p-4">
          <p className="text-lg font-bold">{parsed.title || '—'}</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm" aria-label="ما فهمتُه">
            <li className="rounded-full bg-card px-3 py-1">{repeatText({ ...parsed })}</li>
            {parsed.dueTime && <li className="num rounded-full bg-card px-3 py-1">الساعة {parsed.dueTime}</li>}
            {parsed.important && <li className="rounded-full bg-saffron-soft px-3 py-1">مهمة ★</li>}
          </ul>
          <div className="mt-3">
            <Segmented
              label="النوع"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'work', label: 'عمل' },
                { value: 'personal', label: 'شخصي' },
              ]}
            />
          </div>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button onClick={save} disabled={busy || !text.trim() || speech.listening}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ المهمة'}
        </Button>
        <Button kind="quiet" disabled={!text.trim()} onClick={() => onDetails(task)}>
          تعديل التفاصيل
        </Button>
      </div>
      {!text.trim() && (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          قولي اسم المهمة ثم متى: «اليوم»، «غداً»، «يوم الخميس»، «كل يوم»، «كل أحد وأربعاء»، «يوم 5 من كل شهر»، ثم الوقت «الساعة 9 صباحاً». وأضيفي «شخصي» أو «مهم» إن أردتِ.
        </p>
      )}
    </Modal>
  )
}
