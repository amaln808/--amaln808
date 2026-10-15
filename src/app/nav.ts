import { t } from '../i18n/index'
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
  { to: '/', get label() { return ar.nav.dashboard }, get shortLabel() { return t("المؤشرات", "Dashboard") }, icon: LayoutDashboard, primary: true },
  { to: '/inventory', get label() { return ar.nav.inventory }, icon: Boxes, primary: true },
  { to: '/production', get label() { return ar.nav.production }, icon: Factory, primary: true },
  { to: '/customers', get label() { return ar.nav.customers }, get shortLabel() { return ar.nav.customersShort }, icon: Users, primary: true, also: ['/invoices', '/quotes'] },
  { to: '/suppliers', get label() { return ar.nav.suppliers }, icon: Truck, primary: false, also: ['/purchases'] },
  { to: '/expenses', get label() { return ar.nav.expenses }, icon: ReceiptText, primary: false },
  { to: '/settings', get label() { return ar.nav.settings }, icon: Settings, primary: false },
]
