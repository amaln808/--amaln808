import { Languages } from 'lucide-react'
import { getLang } from '../i18n/index'
import { setLanguage } from './language'

/** One-tap switch between العربية and English. */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const next = getLang() === 'ar' ? 'en' : 'ar'
  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[15px] text-stone-600 hover:bg-stone-100 ${className}`}
      lang={next}
    >
      <Languages className="size-5" />
      {next === 'en' ? 'English' : 'العربية'}
    </button>
  )
}
