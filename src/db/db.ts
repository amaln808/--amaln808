import Dexie, { type EntityTable } from 'dexie'
import type {
  Customer,
  CustomerPayment,
  Expense,
  ExpenseCategory,
  Item,
  ProductionBatch,
  Purchase,
  Recipe,
  SalesInvoice,
  Settings,
  StockMovement,
  Supplier,
  SupplierPayment,
} from './types'

export class FactoryDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  items!: EntityTable<Item, 'id'>
  stockMovements!: EntityTable<StockMovement, 'id'>
  suppliers!: EntityTable<Supplier, 'id'>
  purchases!: EntityTable<Purchase, 'id'>
  supplierPayments!: EntityTable<SupplierPayment, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  productionBatches!: EntityTable<ProductionBatch, 'id'>
  customers!: EntityTable<Customer, 'id'>
  salesInvoices!: EntityTable<SalesInvoice, 'id'>
  customerPayments!: EntityTable<CustomerPayment, 'id'>
  expenseCategories!: EntityTable<ExpenseCategory, 'id'>
  expenses!: EntityTable<Expense, 'id'>

  constructor(name = 'tamr-factory') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      items: 'id, type, name, active',
      stockMovements: 'id, itemId, date, type, [refType+refId]',
      suppliers: 'id, name',
      purchases: 'id, supplierId, date',
      supplierPayments: 'id, supplierId, purchaseId, date',
      recipes: 'id, finishedItemId',
      productionBatches: 'id, &batchNo, date, finishedItemId',
      customers: 'id, name',
      salesInvoices: 'id, &invoiceNo, customerId, date',
      customerPayments: 'id, customerId, invoiceId, date',
      expenseCategories: 'id, name',
      expenses: 'id, categoryId, date',
    })
  }
}

export const db = new FactoryDB()
