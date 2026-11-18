import type { Employee, Role } from './types'
import { L } from './types'

export const ROLES: Record<Role, L> = {
  admin: L('مدير النظام', 'System admin'),
  hr: L('الموارد البشرية', 'HR'),
  manager: L('مدير مباشر', 'Line manager'),
  employee: L('موظف', 'Employee'),
}

/** Everyone who reports to `managerId`, directly or through others */
export function reportsOf(managerId: string, employees: Employee[]): Employee[] {
  const out: Employee[] = []
  const seen = new Set<string>([managerId])
  const queue = [managerId]
  while (queue.length) {
    const id = queue.shift()!
    for (const e of employees)
      if (e.managerId === id && !seen.has(e.id)) {
        seen.add(e.id)
        out.push(e)
        queue.push(e.id)
      }
  }
  return out
}

/** Whose data the viewer may see: admin and HR see everyone, a manager sees their team, an employee themself */
export function visibleEmployees(viewer: Employee, employees: Employee[]): Employee[] {
  if (viewer.role === 'admin' || viewer.role === 'hr') return employees
  if (viewer.role === 'manager') return [viewer, ...reportsOf(viewer.id, employees)]
  return employees.filter((e) => e.id === viewer.id)
}

export type Action =
  | 'manage_employees'
  | 'manage_structure'
  | 'manage_org'
  | 'manage_goals'
  | 'review_others'
  | 'manage_cycles'
  | 'assess_skills'
  | 'see_reports'

const MATRIX: Record<Role, Action[]> = {
  admin: ['manage_employees', 'manage_structure', 'manage_org', 'manage_goals', 'review_others', 'manage_cycles', 'assess_skills', 'see_reports'],
  hr: ['manage_employees', 'manage_structure', 'manage_goals', 'review_others', 'manage_cycles', 'assess_skills', 'see_reports'],
  manager: ['manage_goals', 'review_others', 'assess_skills', 'see_reports'],
  employee: [],
}
export const can = (viewer: Employee, action: Action) => MATRIX[viewer.role].includes(action)

/** May the viewer act (set goals, review, assess) on this employee? Never on themself except self-assessment */
export function canManage(viewer: Employee, target: Employee, employees: Employee[]): boolean {
  if (viewer.id === target.id) return viewer.role === 'admin'
  if (viewer.role === 'admin' || viewer.role === 'hr') return true
  if (viewer.role === 'manager') return reportsOf(viewer.id, employees).some((e) => e.id === target.id)
  return false
}
