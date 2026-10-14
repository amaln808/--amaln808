import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { db } from './db/db'
import { seedIfEmpty } from './db/seed'
import { seedEstimatedRecipes } from './services/recipes'
import './index.css'

seedIfEmpty(db)
  .then(() => seedEstimatedRecipes(db))
  .catch((err) => console.error('seed failed', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
