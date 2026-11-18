import { useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { newId, useMe, useStore } from '../data/store'
import { usePrefs, type ThemeMode } from '../i18n'
import { can } from '../domain/access'
import { SKILL_LEVELS, type Criterion, type Department, type JobFamily, type Position, type Skill, type SkillCategory, type SkillLevel } from '../domain/types'
import { Button, Field, Input, Modal, NumberInput, PageHead, Segmented, Select, Sheet } from '../components/ui'

const FAMILIES: Record<JobFamily, [string, string]> = {
  sales: ['مبيعات', 'Sales'],
  engineering: ['تقنية وهندسة', 'Engineering'],
  hr: ['موارد بشرية', 'HR'],
  finance: ['مالية', 'Finance'],
  operations: ['عمليات', 'Operations'],
  marketing: ['تسويق', 'Marketing'],
  support: ['خدمة عملاء', 'Customer care'],
  management: ['إدارة', 'Management'],
}

export function SettingsPage() {
  const me = useMe()
  const { db, setOrg, resetDemo } = useStore()
  const { t, theme, setTheme, lang, setLang } = usePrefs()
  const org = db.org
  const locked = db.reviews.some((r) => r.status === 'submitted')
  const setCrit = (i: number, patch: Partial<Criterion>) => setOrg({ criteria: org.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  return (
    <>
      <PageHead title={t('الإعدادات', 'Settings')} />
      <div className="grid gap-5">
        {can(me, 'manage_org') && (
          <Sheet title={t('الشركة والتقييم', 'Company & reviews')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('اسم الشركة', 'Company name')}>
                <Input value={org.name} onChange={(e) => setOrg({ name: e.target.value })} />
              </Field>
              <Field label={t('الاسم بالإنجليزية', 'English name')}>
                <Input value={org.nameEn} onChange={(e) => setOrg({ nameEn: e.target.value })} dir="ltr" />
              </Field>
              <Field label={t('مقياس الدرجات', 'Score scale')} hint={locked ? t('مقفل لوجود تقييمات معتمدة (حتى تبقى المقارنات صحيحة).', 'Locked: submitted reviews exist (keeps comparisons valid).') : undefined}>
                <Segmented<5 | 10> label={t('مقياس الدرجات', 'Score scale')} value={org.scale} onChange={(v) => !locked && setOrg({ scale: v })} options={[{ value: 5, label: t('من 1 إلى 5', '1 to 5') }, { value: 10, label: t('من 1 إلى 10', '1 to 10') }]} />
              </Field>
              <Field label={t('عدد التقييمات في السنة', 'Reviews per year')} hint={t('يُطبَّق عند إنشاء دورات سنة جديدة.', 'Applies when a new year’s cycles are created.')}>
                <Segmented<2 | 3> label={t('عدد التقييمات', 'Reviews per year')} value={org.cyclesPerYear} onChange={(v) => setOrg({ cyclesPerYear: v })} options={[{ value: 2, label: t('مرتان', 'Twice') }, { value: 3, label: t('ثلاث مرات', 'Three times') }]} />
              </Field>
              <Field label={t('التنبيه قبل موعد التقييم (أيام)', 'Alert before a review is due (days)')}>
                <NumberInput value={org.reviewAlertDays} onChange={(n) => setOrg({ reviewAlertDays: n === '' ? 0 : n })} />
              </Field>
              <Field label={t('الهدف «يحتاج متابعة» إذا تأخر عن المتوقع بـ (نقاط %)', 'A goal is “at risk” when it trails the expected by (points)')} hint={t('ويصبح «متأخراً» عند ضعفها.', 'And “behind” at twice that.')}>
                <NumberInput value={org.lateThreshold} onChange={(n) => setOrg({ lateThreshold: n === '' ? 0 : n })} />
              </Field>
            </div>
            <h3 className="mt-5 mb-2 font-bold">{t('عناصر التقييم وأوزانها', 'Review items and weights')}</h3>
            <ul className="grid gap-2">
              {org.criteria.map((c, i) => (
                <li key={c.key} className="grid grid-cols-[1fr_1fr_5rem_auto] items-center gap-2">
                  <Input value={c.ar} onChange={(e) => setCrit(i, { ar: e.target.value })} aria-label={t('بالعربية', 'Arabic')} />
                  <Input value={c.en} onChange={(e) => setCrit(i, { en: e.target.value })} aria-label="English" dir="ltr" />
                  <NumberInput value={c.weight} onChange={(n) => setCrit(i, { weight: n === '' ? 1 : n })} aria-label={t('الوزن', 'Weight')} />
                  <Button kind="ghost" disabled={locked || org.criteria.length <= 2} onClick={() => setOrg({ criteria: org.criteria.filter((_, j) => j !== i) })} aria-label={t('حذف', 'Remove')}>
                    <Trash2 size={16} />
                  </Button>
                </li>
              ))}
            </ul>
            <Button kind="quiet" className="mt-2 min-h-9" onClick={() => setOrg({ criteria: [...org.criteria, { key: newId().slice(0, 8), ar: 'عنصر جديد', en: 'New item', weight: 1 }] })}>
              <Plus size={16} /> {t('عنصر تقييم', 'Review item')}
            </Button>
          </Sheet>
        )}

        <Structure />

        <Sheet title={t('المظهر واللغة', 'Appearance & language')}>
          <div className="flex flex-wrap gap-4">
            <Segmented<ThemeMode> label={t('المظهر', 'Theme')} value={theme} onChange={setTheme} options={[{ value: 'light', label: t('فاتح', 'Light') }, { value: 'dark', label: t('داكن', 'Dark') }, { value: 'system', label: t('حسب الجهاز', 'Device') }]} />
            <Segmented label={t('اللغة', 'Language')} value={lang} onChange={setLang} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
          </div>
        </Sheet>

        <Sheet title={t('توسعات قادمة', 'Coming modules')}>
          <p className="text-sm text-muted">
            {t(
              'البيانات مبنية لتستقبل لاحقاً: المكافآت (مرتبطة بنتيجة التقييم وتحقيق الأهداف)، الترقيات (مرتبطة بالمهارات المطلوبة للمنصب التالي)، والخطط التدريبية (من خطة تطوير المهارات).',
              'The data is shaped to take, later: bonuses (from review results and goal achievement), promotions (from the skills the next position needs) and training plans (from the skill development plan).',
            )}
          </p>
        </Sheet>

        {me.role === 'admin' && (
          <Sheet title={t('البيانات التجريبية', 'Demo data')}>
            <p className="mb-3 text-sm text-muted">{t('البيانات محفوظة في هذا الجهاز فقط. إعادة التحميل تمسح تعديلاتك وتعيد الشركة الوهمية كما كانت.', 'Data is kept on this device only. Reloading wipes your changes and restores the fictional company.')}</p>
            <Button kind="danger" onClick={() => confirm(t('إعادة تحميل البيانات التجريبية؟', 'Reload the demo data?')) && resetDemo()}>
              <RotateCcw size={16} /> {t('إعادة تحميل الشركة الوهمية', 'Reload the demo company')}
            </Button>
          </Sheet>
        )}
      </div>
    </>
  )
}

function Structure() {
  const { db, save, remove } = useStore()
  const { t, nm, lang } = usePrefs()
  const [pos, setPos] = useState<Position | null>(null)
  const used = (depId: string) => db.employees.some((e) => e.departmentId === depId) || db.positions.some((p) => p.departmentId === depId)
  return (
    <>
      <Sheet title={t('الأقسام', 'Departments')}>
        <ul className="grid gap-2">
          {db.departments.map((d) => (
            <li key={d.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input value={d.name} onChange={(e) => save('departments', { ...d, name: e.target.value })} aria-label={t('الاسم', 'Name')} />
              <Input value={d.nameEn} onChange={(e) => save('departments', { ...d, nameEn: e.target.value })} aria-label="English" dir="ltr" />
              <Button kind="ghost" disabled={used(d.id)} onClick={() => remove('departments', d.id)} aria-label={t('حذف', 'Remove')} title={used(d.id) ? t('فيه موظفون أو مناصب', 'Has people or positions') : undefined}>
                <Trash2 size={16} />
              </Button>
            </li>
          ))}
        </ul>
        <Button kind="quiet" className="mt-2 min-h-9" onClick={() => save('departments', { id: newId(), orgId: db.org.id, name: t('قسم جديد', 'New department'), nameEn: 'New department' } as Department)}>
          <Plus size={16} /> {t('قسم', 'Department')}
        </Button>
      </Sheet>

      <Sheet title={t('المناصب ومهاراتها المطلوبة', 'Positions and the skills they need')}>
        <ul className="divide-y divide-line">
          {db.positions.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setPos(p)} className="flex min-h-12 w-full flex-wrap items-center gap-x-3 py-2 text-start hover:text-button">
                <b>{lang === 'ar' ? p.title : p.titleEn}</b>
                <span className="text-sm text-muted">
                  {nm(db.departments.find((d) => d.id === p.departmentId) ?? { name: '—' })} · {t(...FAMILIES[p.family])} · {p.requiredSkills.length} {t('مهارات', 'skills')}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          kind="quiet"
          className="mt-2 min-h-9"
          onClick={() => setPos({ id: newId(), orgId: db.org.id, title: '', titleEn: '', departmentId: db.departments[0]?.id ?? '', family: 'operations', requiredSkills: [] })}
        >
          <Plus size={16} /> {t('منصب', 'Position')}
        </Button>
      </Sheet>

      <Sheet title={t('قائمة المهارات', 'Skill catalogue')}>
        <ul className="grid gap-2">
          {db.skills.map((s) => (
            <li key={s.id} className="grid grid-cols-[1fr_1fr_9rem_auto] gap-2">
              <Input value={s.name} onChange={(e) => save('skills', { ...s, name: e.target.value })} aria-label={t('الاسم', 'Name')} />
              <Input value={s.nameEn} onChange={(e) => save('skills', { ...s, nameEn: e.target.value })} aria-label="English" dir="ltr" />
              <Select value={s.category} onChange={(e) => save('skills', { ...s, category: e.target.value as SkillCategory })} aria-label={t('النوع', 'Type')}>
                <option value="technical">{t('تقنية', 'Technical')}</option>
                <option value="soft">{t('شخصية', 'Soft')}</option>
                <option value="leadership">{t('قيادية', 'Leadership')}</option>
              </Select>
              <Button
                kind="ghost"
                disabled={db.skillRecords.some((r) => r.skillId === s.id) || db.positions.some((p) => p.requiredSkills.some((r) => r.skillId === s.id))}
                onClick={() => remove('skills', s.id)}
                aria-label={t('حذف', 'Remove')}
              >
                <Trash2 size={16} />
              </Button>
            </li>
          ))}
        </ul>
        <Button kind="quiet" className="mt-2 min-h-9" onClick={() => save('skills', { id: newId(), orgId: db.org.id, name: t('مهارة جديدة', 'New skill'), nameEn: 'New skill', category: 'technical' } as Skill)}>
          <Plus size={16} /> {t('مهارة', 'Skill')}
        </Button>
      </Sheet>
      {pos && <PositionForm position={pos} onClose={() => setPos(null)} />}
    </>
  )
}

function PositionForm({ position, onClose }: { position: Position; onClose: () => void }) {
  const { db, save, remove } = useStore()
  const { t, tl, nm } = usePrefs()
  const [p, setP] = useState(position)
  const exists = db.positions.some((x) => x.id === p.id)
  const inUse = db.employees.some((e) => e.positionId === p.id)
  return (
    <Modal title={exists ? t('تعديل منصب', 'Edit position') : t('منصب جديد', 'New position')} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('المسمى', 'Title (Arabic)')}>
          <Input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} />
        </Field>
        <Field label={t('المسمى بالإنجليزية', 'Title (English)')}>
          <Input value={p.titleEn} onChange={(e) => setP({ ...p, titleEn: e.target.value })} dir="ltr" />
        </Field>
        <Field label={t('القسم', 'Department')}>
          <Select value={p.departmentId} onChange={(e) => setP({ ...p, departmentId: e.target.value })}>
            {db.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {nm(d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('مجال الوظيفة', 'Job family')} hint={t('يحدد الأهداف التي يقترحها المساعد الذكي.', 'Decides which goals the smart assistant suggests.')}>
          <Select value={p.family} onChange={(e) => setP({ ...p, family: e.target.value as JobFamily })}>
            {(Object.keys(FAMILIES) as JobFamily[]).map((f) => (
              <option key={f} value={f}>
                {t(...FAMILIES[f])}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <h3 className="mt-4 mb-2 font-bold">{t('المهارات المطلوبة ومستواها', 'Required skills and level')}</h3>
      <ul className="grid gap-2">
        {p.requiredSkills.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_9rem_auto] gap-2">
            <Select value={r.skillId} onChange={(e) => setP({ ...p, requiredSkills: p.requiredSkills.map((x, j) => (j === i ? { ...x, skillId: e.target.value } : x)) })} aria-label={t('المهارة', 'Skill')}>
              {db.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {nm(s)}
                </option>
              ))}
            </Select>
            <Select value={r.level} onChange={(e) => setP({ ...p, requiredSkills: p.requiredSkills.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) as SkillLevel } : x)) })} aria-label={t('المستوى', 'Level')}>
              {([1, 2, 3, 4] as SkillLevel[]).map((lv) => (
                <option key={lv} value={lv}>
                  {tl(SKILL_LEVELS[lv])}
                </option>
              ))}
            </Select>
            <Button kind="ghost" onClick={() => setP({ ...p, requiredSkills: p.requiredSkills.filter((_, j) => j !== i) })} aria-label={t('حذف', 'Remove')}>
              <Trash2 size={16} />
            </Button>
          </li>
        ))}
      </ul>
      <Button kind="quiet" className="mt-2 min-h-9" disabled={!db.skills.length} onClick={() => setP({ ...p, requiredSkills: [...p.requiredSkills, { skillId: db.skills[0].id, level: 2 }] })}>
        <Plus size={16} /> {t('مهارة مطلوبة', 'Required skill')}
      </Button>
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        {exists ? (
          <Button kind="danger" disabled={inUse} onClick={() => (remove('positions', p.id), onClose())} title={inUse ? t('يشغله موظفون', 'People hold this position') : undefined}>
            {t('حذف المنصب', 'Delete position')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button kind="quiet" onClick={onClose}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button disabled={!p.title.trim()} onClick={() => (save('positions', p), onClose())}>
            {t('حفظ', 'Save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
