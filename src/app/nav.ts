import {
  Boxes,
  Factory,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  Settings,
  Truck,
  Users,
} from 'lucide-react'
import { ar } from '../i18n/ar'

export interface NavItem {
  to: string
  label: string
  shortLabel?: string
  icon: LucideIcon
  /** Shown in the phone bottom bar; the rest live under "More". */
  primary: boolean
  /** Extra path prefixes that belong to this section */
  also?: string[]
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/'
  return [item.to, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: ar.nav.dashboard, shortLabel: 'المؤشرات', icon: LayoutDashboard, primary: true },
  { to: '/inventory', label: ar.nav.inventory, icon: Boxes, primary: true },
  { to: '/production', label: ar.nav.production, icon: Factory, primary: true },
  { to: '/customers', label: ar.nav.customers, shortLabel: ar.nav.customersShort, icon: Users, primary: true },
  { to: '/suppliers', label: ar.nav.suppliers, icon: Truck, primary: false, also: ['/purchases'] },
  { to: '/expenses', label: ar.nav.expenses, icon: ReceiptText, primary: false },
  { to: '/settings', label: ar.nav.settings, icon: Settings, primary: false },
]
