import {
  BadgePercent,
  Boxes,
  Calculator,
  ClipboardCheck,
  Factory,
  HandCoins,
  History,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  Truck,
  Users,
} from 'lucide-react'
import { t } from '../i18n/index'

export interface NavItem {
  to: string
  label: string
  shortLabel?: string
  icon: LucideIcon
  /** Shown in the phone bottom bar; the rest live under "More". */
  primary: boolean
  /** Build round that delivers this module; 0 = available now */
  phase: number
  /** Extra path prefixes that belong to this section */
  also?: string[]
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/'
  return [item.to, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** Built on demand so labels follow the current language. */
export function navItems(): NavItem[] {
  return [
    { to: '/', label: t('لوحة المؤشرات', 'Dashboard'), shortLabel: t('المؤشرات', 'Dashboard'), icon: LayoutDashboard, primary: true, phase: 4 },
    { to: '/inventory', label: t('المخزون', 'Inventory'), icon: Boxes, primary: true, phase: 0 },
    { to: '/suppliers', label: t('الموردون', 'Suppliers'), icon: Truck, primary: false, phase: 0, also: ['/purchases'] },
    { to: '/products', label: t('المنتجات', 'Products'), icon: Package, primary: false, phase: 0 },
    { to: '/production', label: t('التصنيع', 'Production'), icon: Factory, primary: true, phase: 0 },
    { to: '/quality', label: t('الجودة', 'Quality'), icon: ClipboardCheck, primary: false, phase: 2 },
    { to: '/sales', label: t('العملاء والمبيعات', 'Customers & sales'), shortLabel: t('المبيعات', 'Sales'), icon: Users, primary: true, phase: 2, also: ['/customers', '/invoices', '/quotes'] },
    { to: '/expenses', label: t('المصروفات', 'Expenses'), icon: ReceiptText, primary: false, phase: 3 },
    { to: '/receivables', label: t('المستحقات', 'Receivables'), icon: HandCoins, primary: false, phase: 3 },
    { to: '/pricing', label: t('حاسبة التسعير', 'Pricing calculator'), icon: Calculator, primary: false, phase: 3 },
    { to: '/vat', label: t('الضريبة', 'VAT'), icon: BadgePercent, primary: false, phase: 3 },
    { to: '/tasks', label: t('مهامي', 'My tasks'), icon: ListChecks, primary: false, phase: 0 },
    { to: '/agreements', label: t('الاتفاقيات والتصاريح', 'Agreements & permits'), icon: ScrollText, primary: false, phase: 0 },
    { to: '/audit', label: t('سجل التعديلات', 'Change history'), icon: History, primary: false, phase: 0 },
    { to: '/settings', label: t('الإعدادات', 'Settings'), icon: Settings, primary: false, phase: 0 },
  ]
}
