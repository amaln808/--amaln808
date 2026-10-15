import { db } from '../db/db'
import { SETTINGS_ID } from '../db/seed'
import { applyLang, type Lang } from '../i18n/index'

/** Switches the UI language; the app remounts once settings update. */
export async function setLanguage(lang: Lang) {
  applyLang(lang)
  await db.settings.update(SETTINGS_ID, { uiLanguage: lang })
}
