import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

// Siri / the share sheet open …/himma/?add=<sentence>: keep the sentence (also across a sign-in)
// for the voice window, and take it out of the address so a reload does not add it twice
const added = new URLSearchParams(location.search).get('add')
if (added?.trim()) {
  sessionStorage.setItem('himma-add', added.trim())
  history.replaceState(null, '', location.pathname + location.hash)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
