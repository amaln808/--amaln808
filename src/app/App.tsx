import { lazy, Suspense } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { applyLang, getLang } from '../i18n/index'
import { useSettings } from './useSettings'
import { CustomerDetailPage } from '../features/customers/CustomerDetailPage'
import { CustomersPage } from '../features/customers/CustomersPage'
import { InvoiceDetailPage } from '../features/sales/InvoiceDetailPage'
import { QuoteDetailPage } from '../features/sales/QuoteDetailPage'
import { SalesDocFormPage } from '../features/sales/SalesDocFormPage'
import { ExpensesPage } from '../features/expenses/ExpensesPage'
import { InventoryPage } from '../features/inventory/InventoryPage'
import { ItemDetailPage } from '../features/inventory/ItemDetailPage'
import { PurchaseDetailPage } from '../features/purchases/PurchaseDetailPage'
import { PurchaseFormPage } from '../features/purchases/PurchaseFormPage'
import { SupplierDetailPage } from '../features/suppliers/SupplierDetailPage'
import { BatchDetailPage } from '../features/production/BatchDetailPage'
import { BatchFormPage } from '../features/production/BatchFormPage'
import { ProductionPage } from '../features/production/ProductionPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SuppliersPage } from '../features/suppliers/SuppliersPage'
import { Layout } from './Layout'
import { MorePage } from './MorePage'

// Charts library is large; load the dashboard on demand
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))

// Hash URLs (…/#/inventory) work on any static host and sub-path without server rewrites
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Suspense fallback={null}><DashboardPage /></Suspense> },
      { path: '/inventory', element: <InventoryPage /> },
      { path: '/inventory/:id', element: <ItemDetailPage /> },
      { path: '/production', element: <ProductionPage /> },
      { path: '/production/new', element: <BatchFormPage /> },
      { path: '/production/:id', element: <BatchDetailPage /> },
      { path: '/suppliers', element: <SuppliersPage /> },
      { path: '/suppliers/:id', element: <SupplierDetailPage /> },
      { path: '/purchases/new', element: <PurchaseFormPage /> },
      { path: '/purchases/:id', element: <PurchaseDetailPage /> },
      { path: '/customers', element: <CustomersPage /> },
      { path: '/customers/:id', element: <CustomerDetailPage /> },
      { path: '/invoices/new', element: <SalesDocFormPage key="invoice" kind="invoice" /> },
      { path: '/invoices/:id', element: <InvoiceDetailPage /> },
      { path: '/quotes/new', element: <SalesDocFormPage key="quote" kind="quote" /> },
      { path: '/quotes/:id', element: <QuoteDetailPage /> },
      { path: '/expenses', element: <ExpensesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/more', element: <MorePage /> },
    ],
  },
])

/** Re-renders the whole app in the chosen language (RTL for Arabic, LTR for English). */
export function App() {
  const settings = useSettings()
  const lang = settings?.uiLanguage ?? getLang()
  if (lang !== getLang()) applyLang(lang)
  return <RouterProvider key={lang} router={router} />
}
