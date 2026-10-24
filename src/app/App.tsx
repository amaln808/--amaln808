import { useEffect, useState } from 'react'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ComingSoon } from '../components/ComingSoon'
import { AuthProvider, useAuth } from '../data/auth'
import { isConfigured } from '../data/client'
import { startOutboxSync } from '../data/outbox'
import { AuditPage } from '../features/audit/AuditPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { getLang } from '../i18n/index'
import { LoadingScreen, LoginScreen, NotMemberScreen, SetupScreen } from './Gate'
import { onLanguageChange } from './language'
import { Layout } from './Layout'
import { MorePage } from './MorePage'
import { navItems } from './nav'
import { SettingsProvider } from './settingsContext'

/** Modules of later phases show a "being built" page until their phase lands. */
function placeholderRoutes() {
  return navItems()
    .filter((n) => n.phase > 0)
    .flatMap((n) =>
      [n.to, ...(n.also ?? [])].map((path) => ({
        path: path === '/' ? '/' : `${path}/*`,
        element: <ComingSoon title={n.label} phase={n.phase} />,
      })),
    )
}

// Hash URLs (…/#/inventory) work on any static host and sub-path without server rewrites
function makeRouter() {
  return createHashRouter([
    {
      element: <Layout />,
      children: [
        ...placeholderRoutes(),
        { path: '/settings', element: <SettingsPage /> },
        { path: '/audit', element: <AuditPage /> },
        { path: '/more', element: <MorePage /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ])
}

function SignedInApp() {
  const [router] = useState(makeRouter)
  useEffect(() => startOutboxSync(), [])
  return (
    <SettingsProvider>
      <RouterProvider router={router} />
    </SettingsProvider>
  )
}

function Gate() {
  const { status } = useAuth()
  if (status === 'loading') return <LoadingScreen />
  if (status === 'signedOut') return <LoginScreen />
  if (status === 'notMember') return <NotMemberScreen />
  return <SignedInApp />
}

/** Re-renders the whole app in the chosen language (RTL for Arabic, LTR for English). */
export function App() {
  const [lang, setLang] = useState(getLang)
  useEffect(() => onLanguageChange(setLang), [])
  if (!isConfigured) return <SetupScreen key={lang} />
  return (
    <AuthProvider key={lang}>
      <Gate />
    </AuthProvider>
  )
}
