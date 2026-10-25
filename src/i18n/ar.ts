import { getLang } from './index'

/** Arabic labels (also the shape for English). */
export const AR = {
  appName: 'زوردة',
  nav: {
    dashboard: 'لوحة المؤشرات',
    inventory: 'المخزون',
    production: 'التصنيع',
    suppliers: 'الموردون',
    customers: 'العملاء والمبيعات',
    customersShort: 'المبيعات',
    expenses: 'المصروفات',
    settings: 'الإعدادات',
    more: 'المزيد',
  },
  common: {
    comingSoon: 'قيد التطوير',
    phase: (n: number): string => `ستتوفر هذه الوحدة في المرحلة ${n}`,
    save: 'حفظ',
    cancel: 'إلغاء',
    loading: 'جارٍ التحميل…',
  },
  itemTypes: {
    raw: 'مادة خام',
    packaging: 'تغليف',
    finished: 'منتج نهائي',
  },
  movementTypes: {
    purchase: 'شراء',
    production_in: 'إنتاج (إضافة)',
    production_out: 'استهلاك في الإنتاج',
    sale: 'بيع',
    adjustment: 'تسوية',
    waste: 'تالف',
  },
  customerTypes: {
    individual: 'فرد',
    store: 'متجر',
    distributor: 'موزع',
  },
  invoiceStatus: {
    paid: 'مدفوعة',
    partial: 'مدفوعة جزئياً',
    unpaid: 'غير مدفوعة',
    overdue: 'متأخرة',
  },
  quoteStatus: {
    draft: 'مسودة',
    sent: 'مُرسل',
    accepted: 'مقبول',
    rejected: 'مرفوض',
    expired: 'منتهي',
    invoiced: 'تحوّل لفاتورة',
  },
  paymentMethods: {
    cash: 'نقداً',
    bank: 'تحويل بنكي',
    card: 'بطاقة',
    other: 'أخرى',
  },
  storage: {
    title: 'حفظ البيانات',
    persisted: 'البيانات محمية من الحذف التلقائي على هذا الجهاز.',
    notPersisted:
      'المتصفح قد يحذف البيانات تلقائياً. أضف التطبيق إلى الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) وصدّر نسخة احتياطية بانتظام.',
    unknown: 'تعذر التحقق من حالة التخزين.',
  },
  backup: {
    reminder: 'لم تُصدَّر نسخة احتياطية منذ أكثر من 7 أيام.',
    never: 'لم تُصدَّر أي نسخة احتياطية بعد.',
  },
  settings: {
    business: 'بيانات المشروع',
    businessName: 'اسم المشروع',
    currency: 'العملة',
    currencyValue: 'ريال عماني (ر.ع)',
    vat: 'ضريبة القيمة المضافة',
    vatNote: 'المشروع غير مسجّل حالياً — تظهر في الفاتورة بنسبة 0%.',
  },
}

type Labels = typeof AR

export const EN: Labels = {
  appName: 'Zuwardah',
  nav: {
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    production: 'Production',
    suppliers: 'Suppliers',
    customers: 'Customers & sales',
    customersShort: 'Sales',
    expenses: 'Expenses',
    settings: 'Settings',
    more: 'More',
  },
  common: {
    comingSoon: 'Coming soon',
    phase: (n: number) => `Available in phase ${n}`,
    save: 'Save',
    cancel: 'Cancel',
    loading: 'Loading…',
  },
  itemTypes: { raw: 'Raw material', packaging: 'Packaging', finished: 'Finished product' },
  movementTypes: {
    purchase: 'Purchase',
    production_in: 'Production (in)',
    production_out: 'Used in production',
    sale: 'Sale',
    adjustment: 'Adjustment',
    waste: 'Waste',
  },
  customerTypes: { individual: 'Individual', store: 'Store', distributor: 'Distributor' },
  invoiceStatus: { paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid', overdue: 'Overdue' },
  quoteStatus: { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', rejected: 'Declined', expired: 'Expired', invoiced: 'Invoiced' },
  paymentMethods: { cash: 'Cash', bank: 'Bank transfer', card: 'Card', other: 'Other' },
  storage: {
    title: 'Data storage',
    persisted: 'Your data is protected from automatic deletion on this device.',
    notPersisted:
      'The browser may delete data automatically. Add the app to your Home Screen (Share → Add to Home Screen) and export backups regularly.',
    unknown: "Couldn't check the storage status.",
  },
  backup: {
    reminder: 'No backup exported for over 7 days.',
    never: 'No backup exported yet.',
  },
  settings: {
    business: 'Business details',
    businessName: 'Business name',
    currency: 'Currency',
    currencyValue: 'Omani rial (OMR)',
    vat: 'VAT',
    vatNote: 'Not VAT-registered yet — invoices show VAT at 0%.',
  },
}

/** Labels in the current UI language (read at render time). */
export const ar: Labels = new Proxy(AR, {
  get: (_target, key: string) => (getLang() === 'en' ? EN : AR)[key as keyof Labels],
})
