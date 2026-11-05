-- Promotional samples (note of 5 November 2026): jars given away while
-- promoting the product or seeking new agreements. They leave the ready stock
-- like a sale (FEFO, from sellable lots) but without an invoice; their cost
-- (FIFO, from the lots they came from) counts as a promotion cost in profit.

alter table public.stock_movements drop constraint if exists stock_movements_type_check;
alter table public.stock_movements add constraint stock_movements_type_check check (type in (
  'purchase', 'production_in', 'production_out', 'sale', 'sale_void', 'adjustment', 'waste', 'return', 'sample'
));
alter table public.stock_movements drop constraint if exists stock_movements_ref_type_check;
alter table public.stock_movements add constraint stock_movements_ref_type_check check (ref_type in (
  'purchase', 'batch', 'invoice', 'manual', 'sample'
));

create table public.samples (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  product_id uuid not null references public.items (id) deferrable initially immediate,
  qty numeric(14, 3) not null check (qty > 0),
  -- Who received them: free text (a shop, a pharmacy, an exhibition…)
  recipient text not null check (length(trim(recipient)) > 0),
  -- Set when the recipient is a saved customer
  customer_id uuid references public.customers (id) on delete set null deferrable initially immediate,
  -- Cost of the jars given (FIFO), in baisa
  cost_baisa bigint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid default auth.uid()
);
create index samples_date on public.samples (date);

alter table public.samples enable row level security;
create policy members_all on public.samples for all to authenticated using (public.is_member()) with check (public.is_member());
create trigger audit after insert or update or delete on public.samples for each row execute function public.audit_row();
create trigger set_updated_at before update on public.samples for each row execute function public.set_updated_at();
revoke all on public.samples from anon;
grant select, insert, update, delete on public.samples to authenticated;

-- ── Give samples ────────────────────────────────────────────────────

-- p: {product_id, qty, recipient, date?, customer_id?, notes?}
create or replace function public.give_samples(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_date date := coalesce((p ->> 'date')::date, current_date);
  v_product uuid := (p ->> 'product_id')::uuid;
  v_qty numeric := round((p ->> 'qty')::numeric, 3);
  v_recipient text := trim(coalesce(p ->> 'recipient', ''));
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_out jsonb;
begin
  if v_recipient = '' then
    raise exception 'يُرجى كتابة الجهة التي استلمت العينات | Please say who received the samples';
  end if;
  if not exists (select 1 from items where id = v_product and type = 'finished') then
    raise exception 'يُرجى اختيار منتج | Please choose a product';
  end if;
  -- A recipient written as a saved customer's name is linked to them
  if v_customer is null then
    select id into v_customer from customers where lower(trim(name)) = lower(v_recipient) limit 1;
  end if;
  insert into samples (id, date, product_id, qty, recipient, customer_id, notes)
  values (v_id, v_date, v_product, v_qty, v_recipient, v_customer, nullif(trim(p ->> 'notes'), ''));
  v_out := stock_out(v_product, v_qty, v_date, 'sample', 'sample', v_id, v_recipient, true);
  update samples
     set cost_baisa = (select coalesce(round(sum((x ->> 'qty')::numeric * (x ->> 'unit_cost')::numeric)), 0) from jsonb_array_elements(v_out) x)
   where id = v_id;
  return v_id;
end
$$;

-- Removing a sample record puts the jars back into the lots they came from
create or replace function public.delete_samples(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
begin
  for r in select lot_id, -qty as qty from stock_movements where ref_type = 'sample' and ref_id = p_id loop
    update stock_lots set qty_remaining = qty_remaining + r.qty where id = r.lot_id;
  end loop;
  delete from stock_movements where ref_type = 'sample' and ref_id = p_id;
  delete from samples where id = p_id;
end
$$;

revoke execute on function public.give_samples(jsonb), public.delete_samples(uuid) from public, anon;
grant execute on function public.give_samples(jsonb), public.delete_samples(uuid) to authenticated;

-- ── Backups and «مسح كل البيانات» include samples ───────────────────

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
    'agreements', 'tasks', 'task_completions', 'assets', 'orders', 'order_steps', 'samples'
  ]
$$;

-- Same as 0020 plus samples
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
  truncate samples, order_steps, orders, task_completions, tasks, agreements, invoice_line_lots, invoice_lines, customer_payments,
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
