import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { newId, useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { ROLES, can, visibleEmployees } from '../domain/access'
import { goalsOf, weightedAchievement } from '../domain/goals'
import { reviewHistory } from '../domain/reviews'
import { yearsBetween } from '../domain/dates'
import type { Employee, Role } from '../domain/types'
import { Avatar, Button, Empty, Field, Input, Modal, NumberInput, PageHead, Pill, Select } from '../components/ui'
import { useLookups } from '../components/lookups'

export function EmployeesPage() {
  const me = useMe()
  const { db, today } = useStore()
  const { t, tl, nm, pct } = usePrefs()
  const lk = useLookups()
  const [q, setQ] = useState('')
  const [dep, setDep] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [edit, setEdit] = useState<Employee | 'new' | null>(null)
  const people = visibleEmployees(me, db.employees)
    .filter((e) => showInactive || e.active)
    .filter((e) => !dep || e.departmentId === dep)
    .filter((e) => !q || `${e.name} ${e.nameEn} ${e.email} ${lk.pos(e.positionId)}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))

  return (
    <>
      <PageHead title={t('الموظفون', 'People')} sub={t(`${people.length} موظفاً`, `${people.length} people`)}>
        {can(me, 'manage_employees') && (
          <Button onClick={() => setEdit('new')}>
            <Plus size={18} /> {t('إضافة موظف', 'Add employee')}
          </Button>
        )}
      </PageHead>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={18} className="pointer-events-none absolute start-3 top-3 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث بالاسم أو الوظيفة', 'Search by name or role')} className="ps-10" />
        </div>
        <Select value={dep} onChange={(e) => setDep(e.target.value)} className="w-auto" aria-label={t('القسم', 'Department')}>
          <option value="">{t('كل الأقسام', 'All departments')}</option>
          {db.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {nm(d)}
            </option>
          ))}
        </Select>
        <label className="flex min-h-11 items-center gap-2 px-2 text-sm text-muted">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4" />
          {t('إظهار الموقوفين', 'Show inactive')}
        </label>
      </div>
      {people.length ? (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="hidden border-b border-line text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t('الموظف', 'Employee')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('القسم', 'Department')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('الخبرة', 'Experience')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('إنجاز الأهداف', 'Goal progress')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('آخر تقييم', 'Latest review')}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((e) => {
                const last = reviewHistory(e.id, db.reviews, db.cycles, db.org.criteria, db.org.scale).at(-1)
                const exp = e.priorExperienceYears + yearsBetween(e.hireDate, today)
                return (
                  <tr key={e.id} className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-line px-4 py-3 last:border-0 md:table-row md:p-0">
                    <td className="md:px-4 md:py-2.5">
                      <Link to={`/employees/${e.id}`} className="flex items-center gap-3 hover:underline">
                        <Avatar name={e.name} size={36} />
                        <span>
                          <span className="block font-medium">{nm(e)}</span>
                          <span className="block text-xs text-muted">{lk.pos(e.positionId)}</span>
                        </span>
                        {!e.active && <Pill>{t('موقوف', 'Inactive')}</Pill>}
                        {e.role !== 'employee' && <Pill tone="brand">{tl(ROLES[e.role])}</Pill>}
                      </Link>
                    </td>
                    <td className="hidden md:table-cell md:px-4">{lk.dep(e.departmentId)}</td>
                    <td className="num hidden md:table-cell md:px-4">{t(`${exp.toFixed(1)} سنة`, `${exp.toFixed(1)} yrs`)}</td>
                    <td className="num text-end md:px-4 md:text-start">{pct(weightedAchievement(goalsOf(db.goals, e), today))}</td>
                    <td className="num hidden md:table-cell md:px-4">{last ? `${last.percent}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{t('لا يوجد موظف بهذا البحث.', 'No one matches this search.')}</Empty>
      )}
      {edit && <EmployeeForm employee={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

export function EmployeeForm({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const me = useMe()
  const { db, today, save, remove } = useStore()
  const { t, nm, lang } = usePrefs()
  const [f, setF] = useState<Employee>(
    employee ?? {
      id: newId(),
      orgId: db.org.id,
      name: '',
      nameEn: '',
      email: '',
      phone: '',
      departmentId: db.departments[0]?.id ?? '',
      positionId: '',
      managerId: null,
      role: 'employee',
      hireDate: today,
      priorExperienceYears: 0,
      active: true,
    },
  )
  const [err, setErr] = useState('')
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => setF((x) => ({ ...x, [k]: v }))
  const positions = db.positions.filter((p) => p.departmentId === f.departmentId)
  const hasHistory = employee && (db.reviews.some((r) => r.employeeId === employee.id) || db.goals.some((g) => g.employeeIds.includes(employee.id)) || db.employees.some((e) => e.managerId === employee.id))

  const submit = () => {
    if (!f.name.trim()) return setErr(t('اكتب اسم الموظف', 'Enter the employee’s name'))
    if (!f.positionId) return setErr(t('اختر المنصب', 'Choose a position'))
    if (f.role === 'admin' && me.role !== 'admin') return setErr(t('مدير النظام وحده يمنح صلاحية مدير النظام', 'Only a system admin can grant admin rights'))
    save('employees', { ...f, name: f.name.trim(), nameEn: f.nameEn.trim() })
    onClose()
  }
  const del = () => {
    if (!employee) return
    if (hasHistory) {
      save('employees', { ...employee, active: false })
    } else {
      if (!confirm(t('حذف الموظف نهائياً؟', 'Delete this employee for good?'))) return
      remove('employees', employee.id)
    }
    onClose()
  }

  return (
    <Modal title={employee ? t('تعديل بيانات موظف', 'Edit employee') : t('إضافة موظف', 'Add employee')} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('الاسم', 'Name (Arabic)')}>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label={t('الاسم بالإنجليزية', 'Name (English)')}>
          <Input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} dir="ltr" />
        </Field>
        <Field label={t('البريد', 'Email')}>
          <Input value={f.email} onChange={(e) => set('email', e.target.value)} type="email" dir="ltr" />
        </Field>
        <Field label={t('الهاتف', 'Phone')}>
          <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" dir="ltr" />
        </Field>
        <Field label={t('القسم', 'Department')}>
          <Select value={f.departmentId} onChange={(e) => setF((x) => ({ ...x, departmentId: e.target.value, positionId: '' }))}>
            {db.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {nm(d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('المنصب', 'Position')} hint={!positions.length ? t('أضف مناصب هذا القسم من الإعدادات', 'Add positions for this department in Settings') : undefined}>
          <Select value={f.positionId} onChange={(e) => set('positionId', e.target.value)}>
            <option value="">—</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {lang === 'ar' ? p.title : p.titleEn}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('المدير المباشر', 'Line manager')}>
          <Select value={f.managerId ?? ''} onChange={(e) => set('managerId', e.target.value || null)}>
            <option value="">{t('لا يوجد', 'None')}</option>
            {db.employees
              .filter((e) => e.active && e.id !== f.id)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {nm(e)}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={t('الصلاحية', 'Access role')}>
          <Select value={f.role} onChange={(e) => set('role', e.target.value as Role)}>
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <option key={r} value={r}>
                {lang === 'ar' ? ROLES[r].ar : ROLES[r].en}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('تاريخ التعيين', 'Hire date')}>
          <Input type="date" value={f.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
        </Field>
        <Field label={t('سنوات الخبرة قبل الانضمام', 'Years of experience before joining')}>
          <NumberInput value={f.priorExperienceYears} onChange={(n) => set('priorExperienceYears', n === '' ? 0 : n)} />
        </Field>
      </div>
      {employee && !employee.active && (
        <label className="mt-3 flex items-center gap-2">
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className="size-4" /> {t('إعادة تفعيل الموظف', 'Reactivate this employee')}
        </label>
      )}
      {err && <p className="mt-3 text-late">{err}</p>}
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        {employee && employee.id !== me.id ? (
          <Button kind="danger" onClick={del}>
            {hasHistory ? t('إيقاف الموظف', 'Deactivate') : t('حذف', 'Delete')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button kind="quiet" onClick={onClose}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button onClick={submit}>{t('حفظ', 'Save')}</Button>
        </div>
      </div>
      {hasHistory && <p className="mt-2 text-xs text-muted">{t('للموظف أهداف أو تقييمات، لذلك يُوقف ولا يُحذف حتى يبقى سجله.', 'This person has goals or reviews, so they are deactivated rather than deleted to keep their history.')}</p>}
    </Modal>
  )
}
