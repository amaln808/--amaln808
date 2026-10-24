-- Zawrda v2 — full schema (all modules). Later phases add functions, not tables,
-- unless a new requirement appears. Money = bigint baisa, qty = numeric(14,3).
-- Enumerations are text + CHECK so they can evolve without type migrations.

-- ── Accounts & settings ─────────────────────────────────────────────

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'زوردة',
  company_name_en text default 'Zawrda',
  phone text default '77681600',
  email text,
  cr_no text default '1552738',
  vat_no text,
  address text default 'بوشر',
  address_en text default 'Bausher',
  logo_path text,
  stamp_path text,
  signature_path text,
  -- Not VAT-registered yet (Oct 2026): 0% and no "tax invoice" wording until vat_registered
  vat_registered boolean not null default false,
  default_vat_rate numeric(5, 2) not null default 0 check (default_vat_rate between 0 and 100),
  invoice_prefix text not null default 'INV-',
  quote_prefix text not null default 'Q-',
  batch_prefix text not null default 'B-',
  invoice_due_days int not null default 15 check (invoice_due_days >= 0),
  quote_validity_days int not null default 14 check (quote_validity_days >= 0),
  expiry_alert_days int not null default 30 check (expiry_alert_days >= 0),
  max_moisture_pct numeric(6, 2),
  max_aflatoxin_ppb numeric(8, 2),
  theme_primary text not null default '#6b5433' check (theme_primary ~ '^#[0-9a-fA-F]{6}$'),
  theme_mode text not null default 'system' check (theme_mode in ('light', 'dark', 'system')),
  font_scale text not null default 'md' check (font_scale in ('sm', 'md', 'lg', 'xl')),
  ui_language text not null default 'ar' check (ui_language in ('ar', 'en')),
  doc_language text not null default 'ar' check (doc_language in ('ar', 'en', 'both')),
  last_backup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.doc_counters (
  kind text primary key check (kind in ('invoice', 'quote', 'batch')),
  next_no int not null default 1 check (next_no >= 1)
);

-- ── Suppliers & expense categories ──────────────────────────────────

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  color text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  vat_no text,
  kind text not null default 'materials' check (kind in ('materials', 'expenses', 'both')),
  last_expense_category_id uuid references public.expense_categories (id) on delete set null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- ── Items & stock ───────────────────────────────────────────────────

create table public.items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('raw', 'packaging', 'finished')),
  name text not null,
  name_en text,
  unit text not null check (unit in ('kg', 'g', 'piece', 'liter')),
  sku text,
  min_qty numeric(14, 3) not null default 0 check (min_qty >= 0),
  requires_expiry boolean not null default false,
  -- finished products only
  description text,
  weight_g numeric(10, 2),
  photo_path text,
  shelf_life_days int check (shelf_life_days > 0),
  vat_rate numeric(5, 2) check (vat_rate between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index items_type_idx on public.items (type, active);

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id),
  lot_code text,
  source_type text not null check (source_type in ('purchase', 'production', 'opening', 'adjustment')),
  source_id uuid,
  received_date date not null,
  expiry_date date,
  qty_in numeric(14, 3) not null check (qty_in > 0),
  qty_remaining numeric(14, 3) not null check (qty_remaining >= 0 and qty_remaining <= qty_in),
  unit_cost_baisa numeric(14, 3) not null default 0 check (unit_cost_baisa >= 0),
  -- finished goods: not sellable until 'passed' (released for sale)
  qc_status text not null default 'na' check (qc_status in ('na', 'pending', 'passed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index stock_lots_fefo_idx on public.stock_lots (item_id, expiry_date, received_date)
  where qty_remaining > 0;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id),
  lot_id uuid not null references public.stock_lots (id),
  date date not null,
  type text not null check (type in (
    'purchase', 'production_in', 'production_out', 'sale', 'sale_void', 'adjustment', 'waste', 'return'
  )),
  qty numeric(14, 3) not null check (qty <> 0),
  unit_cost_baisa numeric(14, 3) not null default 0,
  ref_type text not null check (ref_type in ('purchase', 'batch', 'invoice', 'manual')),
  ref_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index stock_movements_item_idx on public.stock_movements (item_id, date);
create index stock_movements_ref_idx on public.stock_movements (ref_type, ref_id);

-- ── Purchases ───────────────────────────────────────────────────────

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  date date not null,
  supplier_invoice_no text,
  subtotal_baisa bigint not null default 0,
  vat_baisa bigint not null default 0,
  total_baisa bigint not null default 0,
  attachment_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index purchases_supplier_idx on public.purchases (supplier_id, date);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  item_id uuid not null references public.items (id),
  qty numeric(14, 3) not null check (qty > 0),
  unit_cost_baisa numeric(14, 3) not null check (unit_cost_baisa >= 0),
  vat_rate numeric(5, 2) not null default 0,
  supplier_lot_code text,
  expiry_date date,
  lot_id uuid references public.stock_lots (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index purchase_lines_purchase_idx on public.purchase_lines (purchase_id);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  purchase_id uuid references public.purchases (id) on delete cascade,
  date date not null,
  amount_baisa bigint not null check (amount_baisa > 0),
  method text not null default 'cash' check (method in ('cash', 'bank', 'card', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index supplier_payments_supplier_idx on public.supplier_payments (supplier_id, date);

-- ── Recipes, production, quality ────────────────────────────────────

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.items (id),
  is_estimate boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.recipe_components (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  item_id uuid not null references public.items (id),
  qty_per_unit numeric(14, 3) not null check (qty_per_unit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (recipe_id, item_id)
);

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  product_id uuid not null references public.items (id),
  production_date date not null,
  expiry_date date,
  qty_produced numeric(14, 3) not null check (qty_produced > 0),
  materials_cost_baisa bigint not null default 0,
  extra_cost_baisa bigint not null default 0,
  total_cost_baisa bigint not null default 0,
  unit_cost_baisa numeric(14, 3) not null default 0,
  output_lot_id uuid references public.stock_lots (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index production_batches_date_idx on public.production_batches (production_date);

create table public.batch_consumption (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches (id) on delete cascade,
  item_id uuid not null references public.items (id),
  lot_id uuid not null references public.stock_lots (id),
  qty numeric(14, 3) not null check (qty > 0),
  unit_cost_baisa numeric(14, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index batch_consumption_batch_idx on public.batch_consumption (batch_id);
create index batch_consumption_lot_idx on public.batch_consumption (lot_id);

create table public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches (id) on delete cascade,
  check_date date not null,
  lab_name text,
  moisture_pct numeric(6, 2),
  aflatoxin_ppb numeric(8, 2),
  result text not null default 'pending' check (result in ('pending', 'pass', 'fail')),
  certificate_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index quality_checks_batch_idx on public.quality_checks (batch_id, check_date);

-- ── Channels, customers, sales ──────────────────────────────────────

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.channel_prices (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  product_id uuid not null references public.items (id),
  price_baisa bigint not null check (price_baisa >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (channel_id, product_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  channel_id uuid references public.channels (id),
  address text,
  vat_no text,
  notes text,
  last_reminder_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  quotation_id uuid,
  customer_id uuid not null references public.customers (id),
  channel_id uuid references public.channels (id),
  date date not null,
  due_date date,
  status text not null default 'issued' check (status in ('issued', 'void')),
  subtotal_baisa bigint not null default 0,
  discount_baisa bigint not null default 0,
  vat_baisa bigint not null default 0,
  total_baisa bigint not null default 0,
  voided_at timestamptz,
  void_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index sales_invoices_customer_idx on public.sales_invoices (customer_id, date);
create index sales_invoices_date_idx on public.sales_invoices (date);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quote_no text not null unique,
  customer_id uuid not null references public.customers (id),
  date date not null,
  valid_until date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  subtotal_baisa bigint not null default 0,
  discount_baisa bigint not null default 0,
  vat_baisa bigint not null default 0,
  total_baisa bigint not null default 0,
  invoice_id uuid references public.sales_invoices (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index quotations_customer_idx on public.quotations (customer_id, date);

alter table public.sales_invoices
  add constraint sales_invoices_quotation_fk foreign key (quotation_id) references public.quotations (id);

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  product_id uuid not null references public.items (id),
  qty numeric(14, 3) not null check (qty > 0),
  unit_price_baisa bigint not null check (unit_price_baisa >= 0),
  vat_rate numeric(5, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index quotation_lines_quotation_idx on public.quotation_lines (quotation_id);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sales_invoices (id) on delete cascade,
  product_id uuid not null references public.items (id),
  qty numeric(14, 3) not null check (qty > 0),
  unit_price_baisa bigint not null check (unit_price_baisa >= 0),
  discount_baisa bigint not null default 0,
  vat_rate numeric(5, 2) not null default 0,
  vat_baisa bigint not null default 0,
  line_total_baisa bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

create table public.invoice_line_lots (
  id uuid primary key default gen_random_uuid(),
  invoice_line_id uuid not null references public.invoice_lines (id) on delete cascade,
  lot_id uuid not null references public.stock_lots (id),
  qty numeric(14, 3) not null check (qty > 0),
  unit_cost_baisa numeric(14, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index invoice_line_lots_line_idx on public.invoice_line_lots (invoice_line_id);
create index invoice_line_lots_lot_idx on public.invoice_line_lots (lot_id);

create table public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  invoice_id uuid references public.sales_invoices (id) on delete set null,
  date date not null,
  amount_baisa bigint not null check (amount_baisa > 0),
  method text not null default 'cash' check (method in ('cash', 'bank', 'card', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index customer_payments_customer_idx on public.customer_payments (customer_id, date);

-- ── Expenses ────────────────────────────────────────────────────────

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category_id uuid not null references public.expense_categories (id),
  supplier_id uuid references public.suppliers (id),
  amount_baisa bigint not null check (amount_baisa > 0),
  vat_baisa bigint not null default 0 check (vat_baisa >= 0),
  method text not null default 'cash' check (method in ('cash', 'bank', 'card', 'other')),
  receipt_path text,
  ocr_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index expenses_date_idx on public.expenses (date);

-- ── Audit log ───────────────────────────────────────────────────────

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

-- ── Migration bookkeeping (used by the GitHub migrate workflow) ─────

create table if not exists public.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
