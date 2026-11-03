-- Orders (owner's request, 3 Nov 2026): follow each customer order from the
-- request to the last payment. An order has a number (O-0001), the customer,
-- the product and quantity, the order date and the date the customer expects
-- it; its stages (quotation, customer approval, production, delivery, payments)
-- each carry a planned date and the date it was done. Progress is worked out in
-- src/domain/orders.ts.

-- ── Numbering ───────────────────────────────────────────────────────

alter table public.doc_counters drop constraint if exists doc_counters_kind_check;
alter table public.doc_counters add constraint doc_counters_kind_check check (kind in ('invoice', 'quote', 'batch', 'order'));
insert into public.doc_counters (kind, next_no) values ('order', 1) on conflict (kind) do nothing;
alter table public.settings add column if not exists order_prefix text not null default 'O-';

-- Same as 0002, with the order prefix
create or replace function public.next_doc_no(p_kind text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  n int;
  prefix text;
begin
  if not public.is_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.doc_counters set next_no = next_no + 1 where kind = p_kind returning next_no - 1 into n;
  if n is null then
    raise exception 'unknown counter %', p_kind;
  end if;
  select case p_kind
           when 'invoice' then s.invoice_prefix
           when 'quote' then s.quote_prefix
           when 'order' then s.order_prefix
           else s.batch_prefix
         end
    into prefix
    from public.settings s where s.id = 1;
  return coalesce(prefix, '') || lpad(n::text, 4, '0');
end
$$;

-- ── Tables ──────────────────────────────────────────────────────────

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid not null references public.customers (id) deferrable initially immediate,
  product_id uuid references public.items (id) deferrable initially immediate,
  qty numeric(14, 3) check (qty is null or qty > 0),
  order_date date not null default current_date,
  -- The date the customer expects to receive it
  due_date date,
  -- Agreed value (optional)
  amount_baisa bigint check (amount_baisa is null or amount_baisa >= 0),
  quotation_id uuid references public.quotations (id) on delete set null deferrable initially immediate,
  invoice_id uuid references public.sales_invoices (id) on delete set null deferrable initially immediate,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid default auth.uid()
);

create table public.order_steps (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade deferrable initially immediate,
  kind text not null check (kind in ('quote', 'approval', 'production', 'delivery', 'payment', 'other')),
  title text not null check (length(trim(title)) > 0),
  planned_date date,
  done_date date,
  -- Payment stages: the instalment amount
  amount_baisa bigint check (amount_baisa is null or amount_baisa >= 0),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid default auth.uid()
);
create index order_steps_order on public.order_steps (order_id, sort_order);

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'order_steps'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy members_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- ── New order with its usual stages ─────────────────────────────────

-- p: {customer_id? | customer_name, product_id?, qty?, order_date?, due_date?, amount_baisa?, notes?}
create or replace function public.create_order(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_customer uuid := coalesce(nullif(p ->> 'customer_id', '')::uuid, customer_by_name(p ->> 'customer_name'));
  v_due date := nullif(p ->> 'due_date', '')::date;
begin
  perform require_member();
  -- A backup made before orders existed restores without this counter
  insert into doc_counters (kind, next_no) values ('order', 1) on conflict (kind) do nothing;
  insert into orders (order_no, customer_id, product_id, qty, order_date, due_date, amount_baisa, notes)
  values (next_doc_no('order'), v_customer, nullif(p ->> 'product_id', '')::uuid, nullif(p ->> 'qty', '')::numeric,
          coalesce(nullif(p ->> 'order_date', '')::date, current_date), v_due,
          nullif(p ->> 'amount_baisa', '')::bigint, nullif(trim(p ->> 'notes'), ''))
  returning id into v_id;
  insert into order_steps (order_id, kind, title, planned_date, sort_order) values
    (v_id, 'quote', 'إرسال عرض الأسعار', null, 1),
    (v_id, 'approval', 'موافقة العميل على العرض', null, 2),
    (v_id, 'production', 'التصنيع والإنتاج', null, 3),
    (v_id, 'delivery', 'التوصيل والاستلام', v_due, 4),
    (v_id, 'payment', 'الدفعة', null, 5);
  return v_id;
end
$$;

-- When a quotation linked to an order is accepted, the order gets the invoice
-- and its approval stage is done that day.
create or replace function public.sync_order_from_quotation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update orders set invoice_id = coalesce(invoice_id, new.invoice_id) where quotation_id = new.id;
    update order_steps set done_date = current_date
     where kind = 'approval' and done_date is null
       and order_id in (select id from orders where quotation_id = new.id);
  end if;
  return new;
end
$$;
create trigger sync_order after update on public.quotations
for each row execute function public.sync_order_from_quotation();

-- ── Backups and «مسح كل البيانات» include orders ────────────────────

create or replace function public.backup_tables()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'settings', 'doc_counters', 'expense_categories', 'suppliers', 'items', 'stock_lots', 'stock_movements',
    'purchases', 'purchase_lines', 'supplier_payments', 'recipes', 'recipe_components', 'production_batches',
    'batch_consumption', 'quality_checks', 'channels', 'channel_prices', 'customers', 'sales_invoices',
    'quotations', 'quotation_lines', 'invoice_lines', 'invoice_line_lots', 'customer_payments', 'expenses',
    'agreements', 'tasks', 'task_completions', 'assets', 'orders', 'order_steps'
  ]
$$;

-- Same as 0017 plus the order tables
create or replace function public.reset_all_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from members where user_id = auth.uid() and active and role = 'owner') then
    raise exception 'هذا الإجراء لصاحبة المشروع فقط | Only the owner can do this' using errcode = '42501';
  end if;
  truncate order_steps, orders, task_completions, tasks, agreements, invoice_line_lots, invoice_lines, customer_payments,
           quotation_lines, quotations, sales_invoices, customers, channel_prices, channels,
           quality_checks, batch_consumption, production_batches, recipe_components, recipes,
           supplier_payments, purchase_lines, purchases, stock_movements, stock_lots, items,
           expenses, suppliers, expense_categories, assets
           restart identity cascade;
  update doc_counters set next_no = 1 where true;
  insert into channels (name, name_en, sort_order) values
    ('إغاثة', 'Relief', 1), ('تجزئة', 'Retail', 2), ('صيدليات', 'Pharmacies', 3), ('تغذية رياضية', 'Sports nutrition', 4);
  insert into expense_categories (name, name_en, color, is_default) values
    ('إيجار', 'Rent', '#2a78d6', true), ('كهرباء', 'Electricity', '#eb6834', true), ('ماء', 'Water', '#1baf7a', true),
    ('رواتب', 'Salaries', '#8b5cf6', true), ('نقل', 'Transport', '#d97706', true), ('تغليف', 'Packaging', '#0891b2', true),
    ('تسويق', 'Marketing', '#db2777', true), ('صيانة', 'Maintenance', '#65a30d', true),
    ('رسوم حكومية', 'Government fees', '#64748b', true), ('أخرى', 'Other', '#78716c', true);
  insert into audit_log (user_id, table_name, record_id, action, new_data)
  values (auth.uid(), 'all', null, 'delete', jsonb_build_object('event', 'reset_all_data'));
end
$$;

revoke execute on function public.create_order(jsonb), public.sync_order_from_quotation() from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;
