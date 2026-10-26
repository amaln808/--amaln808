import { toCamel } from "./case";
import { db } from "./client";
import { INVENTORY_KEY, type PaymentMethod } from "./inventory";
import { enqueue, flushOutbox, registerOutboxHandler } from "./outbox";
import { PRODUCTION_KEY } from "./production";
import { invalidate } from "./useQuery";

export interface Channel {
  id: string;
  name: string;
  nameEn: string | null;
  sortOrder: number;
  active: boolean;
}

export interface ChannelPrice {
  channelId: string;
  productId: string;
  priceBaisa: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  channelId: string | null;
  address: string | null;
  vatNo: string | null;
  notes: string | null;
  lastReminderAt: string | null;
  active: boolean;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";

export interface Quotation {
  id: string;
  quoteNo: string;
  customerId: string;
  date: string;
  validUntil: string | null;
  status: QuoteStatus;
  subtotalBaisa: number;
  discountBaisa: number;
  vatBaisa: number;
  totalBaisa: number;
  invoiceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  quotationId: string | null;
  customerId: string;
  channelId: string | null;
  date: string;
  dueDate: string | null;
  status: "issued" | "void";
  subtotalBaisa: number;
  discountBaisa: number;
  vatBaisa: number;
  totalBaisa: number;
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  invoiceId: string | null;
  date: string;
  amountBaisa: number;
  method: PaymentMethod;
  notes: string | null;
}

export interface SaleLine {
  id: string;
  productId: string;
  qty: number;
  unitPriceBaisa: number;
  discountBaisa: number;
  vatRate: number;
  vatBaisa: number;
  /** Lots the quantity came out of (invoices only) */
  lots: Array<{
    lotId: string;
    lotCode: string | null;
    expiryDate: string | null;
    qty: number;
    unitCostBaisa: number;
  }>;
}

export const SALES_KEY = "sales";

const MONEY = [
  "subtotalBaisa",
  "discountBaisa",
  "vatBaisa",
  "totalBaisa",
  "amountBaisa",
  "priceBaisa",
] as const;
function num<T>(r: Record<string, unknown>): T {
  const c = toCamel(r) as Record<string, unknown>;
  for (const k of MONEY) if (k in c) c[k] = Number(c[k]);
  if ("sortOrder" in c) c.sortOrder = Number(c.sortOrder);
  return c as T;
}

/** Everything the sales pages list; small enough for a factory to load at once. */
export async function fetchSales() {
  const [ch, pr, cu, qu, inv, pay] = await Promise.all([
    db().from("channels").select("*").order("sort_order").order("name"),
    db().from("channel_prices").select("channel_id, product_id, price_baisa"),
    db().from("customers").select("*").order("name"),
    db()
      .from("quotations")
      .select("*")
      .order("date", { ascending: false })
      .order("quote_no", { ascending: false }),
    db()
      .from("sales_invoices")
      .select("*")
      .order("date", { ascending: false })
      .order("invoice_no", { ascending: false }),
    db()
      .from("customer_payments")
      .select("*")
      .order("date", { ascending: false }),
  ]);
  for (const r of [ch, pr, cu, qu, inv, pay]) if (r.error) throw r.error;
  return {
    channels: ch.data!.map((r) => num<Channel>(r)),
    prices: pr.data!.map((r) => num<ChannelPrice>(r)),
    customers: cu.data!.map((r) => num<Customer>(r)),
    quotations: qu.data!.map((r) => num<Quotation>(r)),
    invoices: inv.data!.map((r) => num<Invoice>(r)),
    payments: pay.data!.map((r) => num<CustomerPayment>(r)),
  };
}
export type SalesData = Awaited<ReturnType<typeof fetchSales>>;

const toLine = (r: Record<string, unknown>): SaleLine => ({
  id: r.id as string,
  productId: r.product_id as string,
  qty: Number(r.qty),
  unitPriceBaisa: Number(r.unit_price_baisa),
  discountBaisa: Number(r.discount_baisa ?? 0),
  vatRate: Number(r.vat_rate ?? 0),
  vatBaisa: Number(r.vat_baisa ?? 0),
  lots: (
    (r.invoice_line_lots as Array<Record<string, unknown>> | undefined) ?? []
  ).map((l) => {
    const lot = l.stock_lots as Record<string, unknown>;
    return {
      lotId: l.lot_id as string,
      lotCode: (lot?.lot_code as string | null) ?? null,
      expiryDate: (lot?.expiry_date as string | null) ?? null,
      qty: Number(l.qty),
      unitCostBaisa: Number(l.unit_cost_baisa),
    };
  }),
});

export async function fetchInvoiceDetail(id: string) {
  const [inv, lines] = await Promise.all([
    db().from("sales_invoices").select("*").eq("id", id).single(),
    db()
      .from("invoice_lines")
      .select(
        "*, invoice_line_lots(lot_id, qty, unit_cost_baisa, stock_lots(lot_code, expiry_date))",
      )
      .eq("invoice_id", id)
      .order("created_at"),
  ]);
  if (inv.error) throw inv.error;
  if (lines.error) throw lines.error;
  return { invoice: num<Invoice>(inv.data), lines: lines.data.map(toLine) };
}

export async function fetchQuotationDetail(id: string) {
  const [q, lines] = await Promise.all([
    db().from("quotations").select("*").eq("id", id).single(),
    db()
      .from("quotation_lines")
      .select("*")
      .eq("quotation_id", id)
      .order("created_at"),
  ]);
  if (q.error) throw q.error;
  if (lines.error) throw lines.error;
  return { quotation: num<Quotation>(q.data), lines: lines.data.map(toLine) };
}

export interface PastPrice {
  customerId: string;
  productId: string;
  date: string;
  priceBaisa: number;
}

/** Prices on earlier invoices and quotations, newest first — the form reuses them. */
export async function fetchPastPrices(): Promise<PastPrice[]> {
  const [inv, quo] = await Promise.all([
    db()
      .from("invoice_lines")
      .select(
        "product_id, unit_price_baisa, created_at, sales_invoices(customer_id, date, status)",
      ),
    db()
      .from("quotation_lines")
      .select(
        "product_id, unit_price_baisa, created_at, quotations(customer_id, date)",
      ),
  ]);
  if (inv.error) throw inv.error;
  if (quo.error) throw quo.error;
  const row = (r: Record<string, unknown>, head: unknown) => {
    const h = head as { customer_id: string; date: string };
    return {
      customerId: h.customer_id,
      productId: r.product_id as string,
      date: `${h.date} ${r.created_at as string}`,
      priceBaisa: Number(r.unit_price_baisa),
    };
  };
  const issued = inv.data.filter(
    (r) =>
      (r.sales_invoices as unknown as { status: string } | null)?.status ===
      "issued",
  );
  return [
    ...issued.map((r) => row(r, r.sales_invoices)),
    ...quo.data.map((r) => row(r, r.quotations)),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

function changed() {
  invalidate(SALES_KEY);
  invalidate("invoice:");
  invalidate("quote:");
  invalidate("customer:");
}
function stockChanged() {
  changed();
  invalidate(INVENTORY_KEY);
  invalidate(PRODUCTION_KEY);
  invalidate("item:");
  invalidate("batch:");
  invalidate("products");
}

// ── Channels and prices ─────────────────────────────────────────────

/** Finds a channel by name (case and spaces ignored) or creates it. */
export async function channelByName(name: string): Promise<string | null> {
  const { data, error } = await db().rpc("channel_by_name", { p_name: name });
  if (error) throw error;
  changed();
  return data as string | null;
}

export async function updateChannel(
  id: string,
  patch: Partial<Pick<Channel, "name" | "active">>,
) {
  const { error } = await db().from("channels").update(patch).eq("id", id);
  if (error) throw error;
  changed();
}

/** Sets (or clears, with null) a product's price for one channel. */
export async function setChannelPrice(
  channelId: string,
  productId: string,
  priceBaisa: number | null,
) {
  const q =
    priceBaisa == null
      ? db()
          .from("channel_prices")
          .delete()
          .eq("channel_id", channelId)
          .eq("product_id", productId)
      : db()
          .from("channel_prices")
          .upsert(
            {
              channel_id: channelId,
              product_id: productId,
              price_baisa: priceBaisa,
            },
            { onConflict: "channel_id,product_id" },
          );
  const { error } = await q;
  if (error) throw error;
  invalidate(SALES_KEY);
}

// ── Customers ───────────────────────────────────────────────────────

export type CustomerDraft = Omit<
  Customer,
  "id" | "channelId" | "lastReminderAt"
> & { id?: string; channelName: string };

export async function saveCustomer(c: CustomerDraft): Promise<string> {
  const channelId = c.channelName.trim()
    ? await channelByName(c.channelName)
    : null;
  const row = {
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    vat_no: c.vatNo,
    notes: c.notes,
    active: c.active,
    channel_id: channelId,
  };
  const q = c.id
    ? db().from("customers").update(row).eq("id", c.id).select("id").single()
    : db().from("customers").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) throw error;
  changed();
  return data.id as string;
}

// ── Quotations and invoices ─────────────────────────────────────────

export interface SaleDraft {
  /** Existing customer, or null with customerName to add it in the same save */
  customerId: string | null;
  customerName: string;
  date: string;
  /** Valid-until (quotation) or due date (invoice); empty uses the setting */
  untilDate: string | null;
  discountBaisa: number;
  notes: string | null;
  lines: Array<{ productId: string; qty: number; unitPriceBaisa: number }>;
}

const salePayload = (d: SaleDraft) => ({
  customer_id: d.customerId,
  customer_name: d.customerName,
  date: d.date,
  discount_baisa: d.discountBaisa,
  notes: d.notes,
  lines: d.lines.map((l) => ({
    product_id: l.productId,
    qty: l.qty,
    unit_price_baisa: l.unitPriceBaisa,
  })),
});

export async function saveQuotation(
  d: SaleDraft,
  id?: string,
): Promise<string> {
  const { data, error } = await db().rpc("save_quotation", {
    p: { ...salePayload(d), id: id ?? null, valid_until: d.untilDate },
  });
  if (error) throw error;
  changed();
  return data as string;
}

export async function setQuotationStatus(
  id: string,
  status: "draft" | "sent" | "rejected",
) {
  const { error } = await db().rpc("set_quotation_status", {
    p_id: id,
    p_status: status,
  });
  if (error) throw error;
  changed();
}

/** «تم القبول»: returns the new invoice id. */
export async function acceptQuotation(
  id: string,
  date: string,
): Promise<string> {
  const { data, error } = await db().rpc("accept_quotation", {
    p_id: id,
    p_date: date,
  });
  if (error) throw error;
  stockChanged();
  return data as string;
}

export async function createInvoice(d: SaleDraft): Promise<string> {
  const { data, error } = await db().rpc("create_invoice", {
    p: { ...salePayload(d), due_date: d.untilDate },
  });
  if (error) throw error;
  stockChanged();
  return data as string;
}

export async function voidInvoice(id: string, reason: string | null) {
  const { error } = await db().rpc("void_invoice", {
    p_id: id,
    p_reason: reason,
  });
  if (error) throw error;
  stockChanged();
}

// ── Customer payments (work offline; the outbox id becomes the row id) ──

interface PaymentPayload {
  customerId: string;
  invoiceId: string | null;
  date: string;
  amountBaisa: number;
  method: PaymentMethod;
  notes: string | null;
}

registerOutboxHandler<PaymentPayload>("customer.payment", async (p, entry) => {
  const { error } = await db().from("customer_payments").upsert(
    {
      id: entry.id,
      customer_id: p.customerId,
      invoice_id: p.invoiceId,
      date: p.date,
      amount_baisa: p.amountBaisa,
      method: p.method,
      notes: p.notes,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw error;
  changed();
});

export async function recordCustomerPayment(p: PaymentPayload) {
  await enqueue("customer.payment", p);
  await flushOutbox();
}

export async function deleteCustomerPayment(id: string) {
  const { error } = await db().from("customer_payments").delete().eq("id", id);
  if (error) throw error;
  changed();
}

// ── Traceability ────────────────────────────────────────────────────

export interface LotSale {
  invoiceId: string;
  invoiceNo: string;
  date: string;
  status: "issued" | "void";
  customerId: string;
  customerName: string;
  qty: number;
}

/** Forward trace: which invoices and customers received this lot (voided sales included, marked). */
export async function fetchLotSales(lotId: string): Promise<LotSale[]> {
  const { data, error } = await db()
    .from("invoice_line_lots")
    .select(
      "qty, invoice_lines(sales_invoices(id, invoice_no, date, status, customers(id, name)))",
    )
    .eq("lot_id", lotId);
  if (error) throw error;
  return data
    .map((r) => {
      const line = r.invoice_lines as unknown as {
        sales_invoices: Record<string, unknown> & {
          customers: { id: string; name: string };
        };
      };
      const inv = line.sales_invoices;
      return {
        invoiceId: inv.id as string,
        invoiceNo: inv.invoice_no as string,
        date: inv.date as string,
        status: inv.status as LotSale["status"],
        customerId: inv.customers.id,
        customerName: inv.customers.name,
        qty: Number(r.qty),
      };
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.invoiceNo.localeCompare(b.invoiceNo),
    );
}

export interface CustomerLot {
  invoiceId: string;
  invoiceNo: string;
  date: string;
  productId: string;
  lotCode: string | null;
  expiryDate: string | null;
  qty: number;
}

/** Every production lot a customer received on issued invoices (for recalls). */
export async function fetchCustomerLots(
  customerId: string,
): Promise<CustomerLot[]> {
  const { data, error } = await db()
    .from("sales_invoices")
    .select(
      "id, invoice_no, date, invoice_lines(product_id, invoice_line_lots(qty, stock_lots(lot_code, expiry_date)))",
    )
    .eq("customer_id", customerId)
    .eq("status", "issued")
    .order("date", { ascending: false });
  if (error) throw error;
  return data.flatMap((inv) =>
    (
      inv.invoice_lines as unknown as Array<{
        product_id: string;
        invoice_line_lots: Array<{
          qty: number;
          stock_lots: { lot_code: string | null; expiry_date: string | null };
        }>;
      }>
    ).flatMap((l) =>
      l.invoice_line_lots.map((ll) => ({
        invoiceId: inv.id as string,
        invoiceNo: inv.invoice_no as string,
        date: inv.date as string,
        productId: l.product_id,
        lotCode: ll.stock_lots?.lot_code ?? null,
        expiryDate: ll.stock_lots?.expiry_date ?? null,
        qty: Number(ll.qty),
      })),
    ),
  );
}

/** Remembers when the customer was last sent a payment reminder. */
export async function markReminded(customerId: string) {
  const { error } = await db()
    .from("customers")
    .update({ last_reminder_at: new Date().toISOString() })
    .eq("id", customerId);
  if (error) throw error;
  invalidate(SALES_KEY);
}
