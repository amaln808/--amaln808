import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { CustomersPage } from '../features/customers/CustomersPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
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

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardPage /> },
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
      { path: '/expenses', element: <ExpensesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/more', element: <MorePage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
