import { describe, expect, it } from 'vitest'
import { parseTask } from './voice'

// Tuesday 17 November 2026
const T = '2026-11-17'
const p = (s: string) => parseTask(s, T)

describe('parseTask (Arabic speech → task)', () => {
  it('reads the example sentences', () => {
    expect(p('متابعة صيدلية الشفاء كل أحد الساعة 9 صباحاً، مهمة')).toMatchObject({
      title: 'متابعة صيدلية الشفاء', recurrence: 'weekly', weekdays: [0], dueTime: '09:00', important: true,
    })
    expect(p('مشي نصف ساعة كل يوم، شخصي')).toMatchObject({ title: 'مشي نصف ساعة', recurrence: 'daily', intervalN: 1, scope: 'personal' })
    expect(p('تجديد السجل التجاري بعد غد')).toMatchObject({ title: 'تجديد السجل التجاري', recurrence: 'once', startDate: '2026-11-19' })
  })

  it('understands days', () => {
    expect(p('الاتصال بالمورد غداً')).toMatchObject({ title: 'الاتصال بالمورد', startDate: '2026-11-18' })
    expect(p('اجتماع مع البنك بكرة الساعة 10')).toMatchObject({ title: 'اجتماع مع البنك', startDate: '2026-11-18', dueTime: '10:00' })
    expect(p('زيارة المعرض يوم الخميس')).toMatchObject({ title: 'زيارة المعرض', startDate: '2026-11-19' })
    expect(p('دفع الإيجار الثلاثاء')).toMatchObject({ startDate: '2026-11-17' })
    expect(p('دفع الإيجار الثلاثاء القادم')).toMatchObject({ startDate: '2026-11-24' })
    expect(p('تسليم الطلبية بعد 3 أيام')).toMatchObject({ title: 'تسليم الطلبية', startDate: '2026-11-20' })
    expect(p('تسليم الطلبية بعد أسبوع')).toMatchObject({ startDate: '2026-11-24' })
    expect(p('مراجعة الحسابات نهاية الشهر')).toMatchObject({ title: 'مراجعة الحسابات', startDate: '2026-11-30' })
    expect(p('موعد الطبيب 5 ديسمبر الساعة 4 العصر')).toMatchObject({ title: 'موعد الطبيب', startDate: '2026-12-05', dueTime: '16:00' })
    expect(p('تجديد الترخيص ١٠/١ ')).toMatchObject({ title: 'تجديد الترخيص', startDate: '2027-01-10' })
    expect(p('كتابة الخطة الأسبوع القادم')).toMatchObject({ title: 'كتابة الخطة', startDate: '2026-11-22' })
    expect(p('شراء علب اليوم')).toMatchObject({ title: 'شراء علب', startDate: T })
  })

  it('understands repeats', () => {
    expect(p('قراءة كل يومين')).toMatchObject({ title: 'قراءة', recurrence: 'daily', intervalN: 2 })
    expect(p('ري النباتات كل ثلاثة أيام')).toMatchObject({ recurrence: 'daily', intervalN: 3 })
    expect(p('مراجعة المصروفات كل أحد وأربعاء')).toMatchObject({ title: 'مراجعة المصروفات', recurrence: 'weekly', weekdays: [0, 3] })
    expect(p('رياضة كل يوم أحد و يوم الثلاثاء والخميس')).toMatchObject({ title: 'رياضة', weekdays: [0, 2, 4] })
    expect(p('تنظيف المصنع أسبوعياً يوم السبت')).toMatchObject({ title: 'تنظيف المصنع', recurrence: 'weekly', weekdays: [6] })
    expect(p('اجتماع الفريق كل أسبوعين')).toMatchObject({ recurrence: 'weekly', intervalN: 2 })
    expect(p('دفع الكهرباء يوم 5 من كل شهر')).toMatchObject({ title: 'دفع الكهرباء', recurrence: 'monthly', startDate: '2026-12-05' })
    expect(p('دفع الرواتب كل شهر')).toMatchObject({ title: 'دفع الرواتب', recurrence: 'monthly' })
    expect(p('صيانة الخلاط كل 3 أشهر')).toMatchObject({ title: 'صيانة الخلاط', recurrence: 'monthly', intervalN: 3 })
    expect(p('تجديد السجل كل سنة')).toMatchObject({ title: 'تجديد السجل', recurrence: 'yearly' })
    expect(p('ورد الصباح يومياً الساعة 6 صباحا')).toMatchObject({ title: 'ورد الصباح', recurrence: 'daily', dueTime: '06:00' })
  })

  it('understands times', () => {
    expect(p('اتصال الساعة 3')).toMatchObject({ dueTime: '15:00' })
    expect(p('اتصال الساعة 8')).toMatchObject({ dueTime: '08:00' })
    expect(p('اتصال الساعة 9 ونص مساء')).toMatchObject({ title: 'اتصال', dueTime: '21:30' })
    expect(p('اتصال الساعة التاسعة صباحا')).toMatchObject({ dueTime: '09:00' })
    expect(p('اتصال الساعة 10 وربع')).toMatchObject({ dueTime: '10:15' })
    expect(p('اتصال الساعة 5 الا ربع العصر')).toMatchObject({ dueTime: '16:45' })
    expect(p('اتصال 14:30')).toMatchObject({ title: 'اتصال', dueTime: '14:30' })
    expect(p('اجتماع ١١ صباحاً')).toMatchObject({ title: 'اجتماع', dueTime: '11:00' })
    expect(p('اتصال الساعة 12 الظهر')).toMatchObject({ dueTime: '12:00' })
    expect(p('اتصال بالمورد غدا صباحا')).toMatchObject({ title: 'اتصال بالمورد', dueTime: null, startDate: '2026-11-18' })
  })

  it('reads work, personal and importance without eating the title', () => {
    expect(p('عمل تقرير المبيعات غدا')).toMatchObject({ title: 'عمل تقرير المبيعات', scope: null })
    expect(p('تقرير المبيعات، عمل')).toMatchObject({ title: 'تقرير المبيعات', scope: 'work' })
    expect(p('مهمة شخصية: زيارة الوالدة الجمعة')).toMatchObject({ title: 'زيارة الوالدة', scope: 'personal', startDate: '2026-11-20' })
    expect(p('دفع الضريبة ضروري')).toMatchObject({ title: 'دفع الضريبة', important: true })
    expect(p('دفع الضريبة مهم جداً')).toMatchObject({ title: 'دفع الضريبة', important: true })
    expect(p('مهمة إرسال العرض')).toMatchObject({ title: 'إرسال العرض', important: false })
  })

  it('drops spoken commands', () => {
    expect(p('ذكريني بالاتصال بالبنك بكرة')).toMatchObject({ title: 'الاتصال بالبنك', startDate: '2026-11-18' })
    expect(p('أضيفي مهمة شراء الأغطية')).toMatchObject({ title: 'شراء الأغطية' })
    expect(p('سجلي: مراجعة العقد')).toMatchObject({ title: 'مراجعة العقد' })
  })

  it('keeps a plain sentence as the title', () => {
    expect(p('  شراء ملصقات جديدة  ')).toMatchObject({ title: 'شراء ملصقات جديدة', recurrence: 'once', startDate: T, dueTime: null, heard: [] })
  })
})
