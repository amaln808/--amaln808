import { lazy, useEffect, useState } from 'react'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ComingSoon } from '../components/ComingSoon'
import { AuthProvider, useAuth } from '../data/auth'
import { isConfigured } from '../data/client'
import { startOutboxSync } from '../data/outbox'
import { getLang } from '../i18n/index'
import { LoadingScreen, LoginScreen, NotMemberScreen, SetupScreen } from './Gate'
import { onLanguageChange } from './language'
import { Layout } from './Layout'
import { MorePage } from './MorePage'
import { navItems } from './nav'
import { SettingsProvider } from './settingsContext'

// Each page is loaded when first opened, so the app starts with a small download.
// The service worker still keeps every page for offline use.
const SamplesPage = lazy(() => import('../features/samples/SamplesPage').then((m) => ({ default: m.SamplesPage })))
const MonthlyReportPage = lazy(() => import('../features/dashboard/MonthlyReportPage').then((m) => ({ default: m.MonthlyReportPage })))
const AgreementsPage = lazy(() => import('../features/agreements/AgreementsPage').then((m) => ({ default: m.AgreementsPage })))
const InventoryPage = lazy(() => import('../features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })))
const ItemPage = lazy(() => import('../features/inventory/ItemPage').then((m) => ({ default: m.ItemPage })))
const ReadyStockPage = lazy(() => import('../features/inventory/ReadyStockPage').then((m) => ({ default: m.ReadyStockPage })))
const BatchFormPage = lazy(() => import('../features/production/BatchFormPage').then((m) => ({ default: m.BatchFormPage })))
const LabelPage = lazy(() => import('../features/production/LabelPage').then((m) => ({ default: m.LabelPage })))
const BatchPage = lazy(() => import('../features/production/BatchPage').then((m) => ({ default: m.BatchPage })))
const CalculatorPage = lazy(() => import('../features/production/CalculatorPage').then((m) => ({ default: m.CalculatorPage })))
const ProductionPage = lazy(() => import('../features/production/ProductionPage').then((m) => ({ default: m.ProductionPage })))
const ProductPage = lazy(() => import('../features/products/ProductPage').then((m) => ({ default: m.ProductPage })))
const ProductsPage = lazy(() => import('../features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })))
const PurchaseFormPage = lazy(() => import('../features/purchases/PurchaseFormPage').then((m) => ({ default: m.PurchaseFormPage })))
const PurchasePage = lazy(() => import('../features/purchases/PurchasePage').then((m) => ({ default: m.PurchasePage })))
const SupplierPage = lazy(() => import('../features/suppliers/SupplierPage').then((m) => ({ default: m.SupplierPage })))
const SupplierPricesPage = lazy(() => import('../features/suppliers/SupplierPricesPage').then((m) => ({ default: m.SupplierPricesPage })))
const SuppliersPage = lazy(() => import('../features/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))
const AssetsPage = lazy(() => import('../features/assets/AssetsPage').then((m) => ({ default: m.AssetsPage })))
const AuditPage = lazy(() => import('../features/audit/AuditPage').then((m) => ({ default: m.AuditPage })))
const OrderPage = lazy(() => import('../features/orders/OrderPage').then((m) => ({ default: m.OrderPage })))
const OrdersPage = lazy(() => import('../features/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const PlanPage = lazy(() => import('../features/orders/PlanPage').then((m) => ({ default: m.PlanPage })))
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const TasksPage = lazy(() => import('../features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })))
const StatementPage = lazy(() => import('../features/sales/StatementPage').then((m) => ({ default: m.StatementPage })))
const CustomerPage = lazy(() => import('../features/sales/CustomerPage').then((m) => ({ default: m.CustomerPage })))
const InvoicePage = lazy(() => import('../features/sales/InvoicePage').then((m) => ({ default: m.InvoicePage })))
const QuotePage = lazy(() => import('../features/sales/QuotePage').then((m) => ({ default: m.QuotePage })))
const SaleFormPage = lazy(() => import('../features/sales/SaleFormPage').then((m) => ({ default: m.SaleFormPage })))
const SalesPage = lazy(() => import('../features/sales/SalesPage').then((m) => ({ default: m.SalesPage })))
const ExpenseFormPage = lazy(() => import('../features/expenses/ExpenseFormPage').then((m) => ({ default: m.ExpenseFormPage })))
const ExpensesPage = lazy(() => import('../features/expenses/ExpensesPage').then((m) => ({ default: m.ExpensesPage })))
const ReceivablesPage = lazy(() => import('../features/receivables/ReceivablesPage').then((m) => ({ default: m.ReceivablesPage })))
const PricingPage = lazy(() => import('../features/pricing/PricingPage').then((m) => ({ default: m.PricingPage })))
const VatPage = lazy(() => import('../features/vat/VatPage').then((m) => ({ default: m.VatPage })))

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
        { path: '/', element: <DashboardPage /> },
        { path: '/ready', element: <ReadyStockPage /> },
        { path: '/samples', element: <SamplesPage /> },
        { path: '/inventory', element: <InventoryPage /> },
        { path: '/inventory/:id', element: <ItemPage /> },
        { path: '/suppliers', element: <SuppliersPage /> },
        { path: '/suppliers/prices', element: <SupplierPricesPage /> },
        { path: '/suppliers/:id', element: <SupplierPage /> },
        { path: '/purchases/new', element: <PurchaseFormPage /> },
        { path: '/purchases/:id', element: <PurchasePage /> },
        { path: '/products', element: <ProductsPage /> },
        { path: '/products/:id', element: <ProductPage /> },
        { path: '/production', element: <ProductionPage /> },
        { path: '/production/new', element: <BatchFormPage /> },
        { path: '/production/calculator', element: <CalculatorPage /> },
        { path: '/production/:id', element: <BatchPage /> },
        { path: '/production/:id/label', element: <LabelPage /> },
        { path: '/sales', element: <SalesPage /> },
        { path: '/orders', element: <OrdersPage /> },
        { path: '/orders/plan', element: <PlanPage /> },
        { path: '/orders/:id', element: <OrderPage /> },
        { path: '/expenses', element: <ExpensesPage /> },
        { path: '/receivables', element: <ReceivablesPage /> },
        { path: '/pricing', element: <PricingPage /> },
        { path: '/vat', element: <VatPage /> },
        { path: '/reports/monthly', element: <MonthlyReportPage /> },
        { path: '/assets', element: <AssetsPage /> },
        { path: '/expenses/new', element: <ExpenseFormPage key="new" /> },
        { path: '/expenses/:id', element: <ExpenseFormPage key="edit" /> },
        { path: '/customers/:id', element: <CustomerPage /> },
        { path: '/customers/:id/statement', element: <StatementPage /> },
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
