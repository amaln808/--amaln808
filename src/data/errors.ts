import { t } from '../i18n/index'
import { isNetworkError } from './client'

/** Turns a Supabase/Postgres error into a short Arabic (or English) sentence. */
export function serverError(e: unknown): string {
  if (isNetworkError(e)) return t('لا يوجد اتصال بالإنترنت — لم يُحفظ شيء.', 'No internet connection — nothing was saved.')
  const err = e as { code?: string; message?: string; name?: string }
  if (err?.name === 'UserError' && err.message) return err.message
  // Messages raised by our database functions: 'عربي | English'
  if (err?.message?.includes(' | ')) {
    const [ar, en] = err.message.split(' | ')
    return t(ar.trim(), en.trim())
  }
  if (err?.code === '42501' || /row-level security|permission denied|not allowed/i.test(err?.message ?? ''))
    return t('غير مسموح لهذا الحساب.', 'Not allowed for this account.')
  if (/payload too large|exceeded the maximum allowed size/i.test(err?.message ?? ''))
    return t('الملف أكبر من المسموح.', 'The file is too large.')
  console.error(e)
  return t('حدث خطأ غير متوقع، حاول مرة أخرى.', 'Something went wrong, please try again.')
}
