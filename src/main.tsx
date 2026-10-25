import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { startPwaUpdates } from './app/pwaUpdate'
import { initTheme } from './app/theme'
import { applyLang, getLang } from './i18n/index'
import './index.css'

// Saved language and colours apply before the first paint (no flash)
applyLang(getLang())
initTheme()

// Ask Safari not to evict the offline copy (cached pages and changes waiting to be sent)
navigator.storage?.persist?.().catch(() => {})
startPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
