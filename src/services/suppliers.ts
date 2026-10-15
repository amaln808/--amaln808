import { t } from '../i18n/index'
import type { FactoryDB } from '../db/db'
import { newRecord } from '../db/records'
import type { ID, PaymentMethod, Supplier } from '../db/types'
import { balanceDue, buildStatement, type LedgerEntry } from '../domain/ledger'
import { UserError } from './errors'

export interface SupplierInput {
  name: string
  phone: string
  email?: string
  address?: string
  notes?: string
  active?: boolean
}

export async function saveSupplier(db: FactoryDB, input: SupplierInput, id?: ID): Promise<ID> {
  const name = input.name.trim()
  if (!name) throw new UserError(t("اسم المورد مطلوب", "Supplier name is required"))
  if (id) {
    const existing = await db.suppliers.get(id)
    if (!existing) throw new UserError(t("المورد غير موجود", "Supplier not found"))
    await db.suppliers.put({ ...existing, ...input, name, updatedAt: new Date().toISOString() })
    return id
  }
  const s: Supplier = newRecord({ active: true, ...input, name })
  await db.suppliers.add(s)
  return s.id
}

export async function deleteSupplier(db: FactoryDB, id: ID): Promise<void> {
  await db.transaction('rw', db.suppliers, db.purchases, db.supplierPayments, async () => {
    const used =
      (await db.purchases.where('supplierId').equals(id).count()) +
      (await db.supplierPayments.where('supplierId').equals(id).count())
    if (used) throw new UserError(t("لا يمكن حذف مورد له مشتريات أو دفعات — يمكنك إيقافه بدلاً من ذلك", "A supplier with purchases or payments can't be deleted — deactivate them instead"))
    await db.suppliers.delete(id)
  })
}

export interface SupplierPaymentInput {
  supplierId: ID
  purchaseId?: ID
  date: string
  amountBaisa: number
  method: PaymentMethod
  notes?: string
}

export async function recordSupplierPayment(db: FactoryDB, input: SupplierPaymentInput): Promise<ID> {
  if (!(input.amountBaisa > 0)) throw new UserError(t("أدخل مبلغاً أكبر من صفر", "Enter an amount greater than zero"))
  const p = newRecord(input)
  await db.supplierPayments.add(p)
  return p.id
}

export async function deleteSupplierPayment(db: FactoryDB, id: ID): Promise<void> {
  await db.supplierPayments.delete(id)
}

export async function supplierLedger(db: FactoryDB, supplierId: ID): Promise<LedgerEntry[]> {
  const [purchases, payments] = await Promise.all([
    db.purchases.where('supplierId').equals(supplierId).toArray(),
    db.supplierPayments.where('supplierId').equals(supplierId).toArray(),
  ])
  return [
    ...purchases.map((p): LedgerEntry => ({
      id: p.id,
      date: p.date,
      createdAt: p.createdAt,
      kind: 'invoice',
      chargeBaisa: p.totalBaisa,
      paymentBaisa: 0,
    })),
    ...payments.map((p): LedgerEntry => ({
      id: p.id,
      date: p.date,
      createdAt: p.createdAt,
      kind: 'payment',
      chargeBaisa: 0,
      paymentBaisa: p.amountBaisa,
    })),
  ]
}

export async function supplierStatement(db: FactoryDB, supplierId: ID) {
  return buildStatement(await supplierLedger(db, supplierId))
}

/** Outstanding amount per supplier id. */
export async function supplierBalances(db: FactoryDB): Promise<Map<ID, number>> {
  const [purchases, payments] = await Promise.all([db.purchases.toArray(), db.supplierPayments.toArray()])
  const charges = new Map<ID, number[]>()
  const paid = new Map<ID, number[]>()
  for (const p of purchases) charges.set(p.supplierId, [...(charges.get(p.supplierId) ?? []), p.totalBaisa])
  for (const p of payments) paid.set(p.supplierId, [...(paid.get(p.supplierId) ?? []), p.amountBaisa])
  const ids = new Set([...charges.keys(), ...paid.keys()])
  return new Map([...ids].map((id) => [id, balanceDue(charges.get(id) ?? [], paid.get(id) ?? [])]))
}
