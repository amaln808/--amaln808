import { useEffect, useState } from 'react'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ComingSoon } from '../components/ComingSoon'
import { AuthProvider, useAuth } from '../data/auth'
import { isConfigured } from '../data/client'
import { startOutboxSync } from '../data/outbox'
import { AgreementsPage } from '../features/agreements/AgreementsPage'
import { InventoryPage } from '../features/inventory/InventoryPage'
import { ItemPage } from '../features/inventory/ItemPage'
import { BatchFormPage } from '../features/production/BatchFormPage'
import { BatchPage } from '../features/production/BatchPage'
import { CalculatorPage } from '../features/production/CalculatorPage'
import { ProductionPage } from '../features/production/ProductionPage'
import { ProductPage } from '../features/products/ProductPage'
import { ProductsPage } from '../features/products/ProductsPage'
import { PurchaseFormPage } from '../features/purchases/PurchaseFormPage'
import { PurchasePage } from '../features/purchases/PurchasePage'
import { SupplierPage } from '../features/suppliers/SupplierPage'
import { SuppliersPage } from '../features/suppliers/SuppliersPage'
import { AuditPage } from '../features/audit/AuditPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { QualityPage } from '../features/quality/QualityPage'
import { CustomerPage } from '../features/sales/CustomerPage'
import { InvoicePage } from '../features/sales/InvoicePage'
import { QuotePage } from '../features/sales/QuotePage'
import { SaleFormPage } from '../features/sales/SaleFormPage'
import { SalesPage } from '../features/sales/SalesPage'
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
        { path: '/inventory', element: <InventoryPage /> },
        { path: '/inventory/:id', element: <ItemPage /> },
        { path: '/suppliers', element: <SuppliersPage /> },
        { path: '/suppliers/:id', element: <SupplierPage /> },
        { path: '/purchases/new', element: <PurchaseFormPage /> },
        { path: '/purchases/:id', element: <PurchasePage /> },
        { path: '/products', element: <ProductsPage /> },
        { path: '/products/:id', element: <ProductPage /> },
        { path: '/production', element: <ProductionPage /> },
        { path: '/production/new', element: <BatchFormPage /> },
        { path: '/production/calculator', element: <CalculatorPage /> },
        { path: '/production/:id', element: <BatchPage /> },
        { path: '/quality', element: <QualityPage /> },
        { path: '/sales', element: <SalesPage /> },
        { path: '/customers/:id', element: <CustomerPage /> },
        { path: '/quotes/new', element: <SaleFormPage key="quote-new" kind="quote" /> },
        { path: '/quotes/:id/edit', element: <SaleFormPage key="quote-edit" kind="quote" /> },
        { path: '/quotes/:id', element: <QuotePage /> },
        { path: '/invoices/new', element: <SaleFormPage key="invoice-new" kind="invoice" /> },
        { path: '/invoices/:id', element: <InvoicePage /> },
        { path: '/settings', element: <SettingsPage /> },
        { path: '/audit', element: <AuditPage /> },
        { path: '/tasks', element: <TasksPage /> },
        { path: '/agreements', element: <AgreementsPage /> },
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
