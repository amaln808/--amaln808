import type { Unit } from '../domain/quantity'

export type ID = string
/** Calendar date, YYYY-MM-DD */
export type ISODate = string
/** Full ISO timestamp */
export type ISODateTime = string

export interface BaseRecord {
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type PaymentMethod = 'cash' | 'bank' | 'card' | 'other'

export interface Settings extends BaseRecord {
  businessName: string
  businessPhone?: string
  currency: 'OMR'
  vatRatePercent: number
  invoicePrefix: string
  batchPrefix: string
  nextInvoiceNo: number
  nextBatchNo: number
  lastBackupAt?: ISODateTime
  /** Set once the estimated starter recipes have been created */
  recipesSeeded?: boolean
}

export type ItemType = 'raw' | 'packaging' | 'finished'

export interface Item extends BaseRecord {
  name: string
  type: ItemType
  unit: Unit
  sku?: string
  minQty: number
  qtyOnHand: number
  avgCostBaisa: number
  salePriceBaisa?: number
  packageSizeG?: number
  active: boolean
}

export type MovementType =
  | 'purchase'
  | 'production_in'
  | 'production_out'
  | 'sale'
  | 'adjustment'
  | 'waste'

export type RefType = 'purchase' | 'batch' | 'invoice' | 'manual'

export interface StockMovement extends BaseRecord {
  itemId: ID
  date: ISODate
  type: MovementType
  /** Positive = in, negative = out */
  qty: number
  unitCostBaisa: number
  refType: RefType
  refId?: ID
  notes?: string
}

export interface Supplier extends BaseRecord {
  name: string
  phone: string
  email?: string
  address?: string
  notes?: string
  active: boolean
}

export interface PurchaseLine {
  itemId: ID
  qty: number
  unitCostBaisa: number
}

export interface Purchase extends BaseRecord {
  supplierId: ID
  date: ISODate
  supplierInvoiceNo?: string
  lines: PurchaseLine[]
  totalBaisa: number
  notes?: string
}

export interface SupplierPayment extends BaseRecord {
  supplierId: ID
  purchaseId?: ID
  date: ISODate
  amountBaisa: number
  method: PaymentMethod
  notes?: string
}

export interface RecipeComponent {
  itemId: ID
  qtyPerUnit: number
}

export interface Recipe extends BaseRecord {
  finishedItemId: ID
  name: string
  components: RecipeComponent[]
  active: boolean
  /** Starter recipe with guessed quantities; cleared when the user saves it */
  isEstimate?: boolean
}

export interface ConsumedLine {
  itemId: ID
  qty: number
  unitCostBaisa: number
}

export interface ProductionBatch extends BaseRecord {
  batchNo: string
  date: ISODate
  recipeId?: ID
  finishedItemId: ID
  qtyProduced: number
  consumed: ConsumedLine[]
  materialsCostBaisa: number
  /** Direct batch costs only (e.g. gas). Salaries are general expenses. */
  extraCostBaisa: number
  totalCostBaisa: number
  unitCostBaisa: number
  expiryDate?: ISODate
  notes?: string
}

export type CustomerType = 'individual' | 'store' | 'distributor'

export interface Customer extends BaseRecord {
  name: string
  phone: string
  type: CustomerType
  address?: string
  notes?: string
  active: boolean
}

export interface InvoiceLine {
  itemId: ID
  qty: number
  unitPriceBaisa: number
  /** Item average cost at the moment of sale, for COGS */
  unitCostBaisa: number
}

export interface SalesInvoice extends BaseRecord {
  invoiceNo: string
  customerId: ID
  date: ISODate
  dueDate?: ISODate
  lines: InvoiceLine[]
  subtotalBaisa: number
  discountBaisa: number
  vatRatePercent: number
  vatBaisa: number
  totalBaisa: number
  notes?: string
}

export interface CustomerPayment extends BaseRecord {
  customerId: ID
  invoiceId?: ID
  date: ISODate
  amountBaisa: number
  method: PaymentMethod
  notes?: string
}

export interface ExpenseCategory extends BaseRecord {
  name: string
  color?: string
  isDefault: boolean
}

export interface Expense extends BaseRecord {
  categoryId: ID
  date: ISODate
  amountBaisa: number
  description?: string
  method: PaymentMethod
}
