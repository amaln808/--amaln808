export const ar = {
  appName: 'مصنع معجون التمر',
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
    phase: (n: number) => `ستتوفر هذه الوحدة في المرحلة ${n}`,
    save: 'حفظ',
    cancel: 'إلغاء',
    loading: 'جارٍ التحميل…',
  },
  itemTypes: {
    raw: 'مادة خام',
    packaging: 'تغليف',
    finished: 'منتج نهائي',
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
    exportSoon: 'زر التصدير إلى Excel سيتوفر في المرحلة 6.',
  },
  settings: {
    business: 'بيانات المشروع',
    businessName: 'اسم المشروع',
    currency: 'العملة',
    currencyValue: 'ريال عماني (ر.ع)',
    vat: 'ضريبة القيمة المضافة',
    vatNote: 'المشروع غير مسجّل حالياً — تظهر في الفاتورة بنسبة 0%.',
  },
} as const
