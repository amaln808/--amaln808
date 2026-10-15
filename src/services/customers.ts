import { t } from '../i18n/index'
import type { FactoryDB } from '../db/db'
import { newRecord } from '../db/records'
import type { Customer, CustomerType, ID, PaymentMethod } from '../db/types'
import { balanceDue, buildStatement, type LedgerEntry } from '../domain/ledger'
import { allocatePayments } from '../domain/sales'
import { UserError } from './errors'

export interface CustomerInput {
  name: string
  phone: string
  type: CustomerType
  address?: string
  notes?: string
  active?: boolean
}

export async function saveCustomer(db: FactoryDB, input: CustomerInput, id?: ID): Promise<ID> {
  const name = input.name.trim()
  if (!name) throw new UserError(t("اسم العميل مطلوب", "Customer name is required"))
  if (id) {
    const existing = await db.customers.get(id)
    if (!existing) throw new UserError(t("العميل غير موجود", "Customer not found"))
    await db.customers.put({ ...existing, ...input, name, updatedAt: new Date().toISOString() })
    return id
  }
  const c: Customer = newRecord({ active: true, ...input, name })
  await db.customers.add(c)
  return c.id
}

export async function deleteCustomer(db: FactoryDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.customers, db.salesInvoices, db.customerPayments, db.quotations], async () => {
    const used =
      (await db.salesInvoices.where('customerId').equals(id).count()) +
      (await db.customerPayments.where('customerId').equals(id).count()) +
      (await db.quotations.where('customerId').equals(id).count())
    if (used) throw new UserError(t("لا يمكن حذف عميل له فواتير أو عروض أو دفعات — يمكنك إيقافه بدلاً من ذلك", "A customer with invoices, quotations or payments can't be deleted — deactivate them instead"))
    await db.customers.delete(id)
  })
}

export interface CustomerPaymentInput {
  customerId: ID
  invoiceId?: ID
  date: string
  amountBaisa: number
  method: PaymentMethod
  notes?: string
}

export async function recordCustomerPayment(db: FactoryDB, input: CustomerPaymentInput): Promise<ID> {
  if (!(input.amountBaisa > 0)) throw new UserError(t("أدخل مبلغاً أكبر من صفر", "Enter an amount greater than zero"))
  const p = newRecord(input)
  await db.customerPayments.add(p)
  return p.id
}

export async function deleteCustomerPayment(db: FactoryDB, id: ID): Promise<void> {
  await db.customerPayments.delete(id)
}

export async function customerStatement(db: FactoryDB, customerId: ID) {
  const [invoices, payments] = await Promise.all([
    db.salesInvoices.where('customerId').equals(customerId).toArray(),
    db.customerPayments.where('customerId').equals(customerId).toArray(),
  ])
  const entries: LedgerEntry[] = [
    ...invoices.map((i): LedgerEntry => ({ id: i.id, date: i.date, createdAt: i.createdAt, kind: 'invoice', chargeBaisa: i.totalBaisa, paymentBaisa: 0 })),
    ...payments.map((p): LedgerEntry => ({ id: p.id, date: p.date, createdAt: p.createdAt, kind: 'payment', chargeBaisa: 0, paymentBaisa: p.amountBaisa })),
  ]
  return buildStatement(entries)
}

/** Outstanding amount per customer id. */
export async function customerBalances(db: FactoryDB): Promise<Map<ID, number>> {
  const [invoices, payments] = await Promise.all([db.salesInvoices.toArray(), db.customerPayments.toArray()])
  const charges = new Map<ID, number[]>()
  const paid = new Map<ID, number[]>()
  for (const i of invoices) charges.set(i.customerId, [...(charges.get(i.customerId) ?? []), i.totalBaisa])
  for (const p of payments) paid.set(p.customerId, [...(paid.get(p.customerId) ?? []), p.amountBaisa])
  const ids = new Set([...charges.keys(), ...paid.keys()])
  return new Map([...ids].map((id) => [id, balanceDue(charges.get(id) ?? [], paid.get(id) ?? [])]))
}

/** Paid amount per invoice id, allocating payments per customer. */
export async function invoicePaidAmounts(db: FactoryDB): Promise<Map<ID, number>> {
  const [invoices, payments] = await Promise.all([db.salesInvoices.toArray(), db.customerPayments.toArray()])
  const result = new Map<ID, number>()
  const customers = new Set(invoices.map((i) => i.customerId))
  for (const c of customers) {
    const { paid } = allocatePayments(
      invoices.filter((i) => i.customerId === c),
      payments.filter((p) => p.customerId === c),
    )
    for (const [id, amount] of paid) result.set(id, amount)
  }
  return result
}
