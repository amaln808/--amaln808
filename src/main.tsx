import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { db } from './db/db'
import { SETTINGS_ID, seedIfEmpty } from './db/seed'
import { applyLang, getLang } from './i18n/index'
import { seedEstimatedRecipes } from './services/recipes'
import './index.css'

seedIfEmpty(db)
  .then(() => seedEstimatedRecipes(db))
  .then(async () => applyLang((await db.settings.get(SETTINGS_ID))?.uiLanguage ?? getLang()))
  .catch((err) => console.error('seed failed', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
