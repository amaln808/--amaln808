import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { CustomersPage } from '../features/customers/CustomersPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { ExpensesPage } from '../features/expenses/ExpensesPage'
import { InventoryPage } from '../features/inventory/InventoryPage'
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
      { path: '/production', element: <ProductionPage /> },
      { path: '/suppliers', element: <SuppliersPage /> },
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
