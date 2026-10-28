-- Fixed assets and depreciation (owner's request, 28 Oct 2026). Machines, fit-out
-- and set-up costs are not one month's expense: each is spread over its useful
-- life (straight line). The monthly share is a fixed cost in profit and pricing,
-- never cash going out (it was paid when bought). The math is in
-- src/domain/depreciation.ts; this table only stores what the owner types.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Free text: «آلات ومعدات», «تجديد وتركيب», «تأسيس وتراخيص», …
  category text,
  purchase_date date not null,
  cost_baisa bigint not null check (cost_baisa > 0),
  life_months int not null check (life_months between 1 and 600),
  -- Expected value when sold at the end (usually 0)
  residual_baisa bigint not null default 0 check (residual_baisa >= 0),
  file_path text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid default auth.uid(),
  check (residual_baisa < cost_baisa)
);

alter table public.assets enable row level security;
create policy members_all on public.assets for all to authenticated using (public.is_member()) with check (public.is_member());
create trigger audit after insert or update or delete on public.assets for each row execute function public.audit_row();
create trigger set_updated_at before update on public.assets for each row execute function public.set_updated_at();
revoke all on public.assets from anon;
grant select, insert, update, delete on public.assets to authenticated;

-- Units the owner plans to make each month: spreads fixed costs over each jar
alter table public.settings add column if not exists planned_monthly_units numeric(14, 3)
  check (planned_monthly_units is null or planned_monthly_units > 0);

-- Backups include the new table
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
    'agreements', 'tasks', 'task_completions', 'assets'
  ]
$$;

-- Same as 0016, but empties every listed table (so a table added later is never left with old rows)
create or replace function public.restore_backup(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  v_rows jsonb;
  v_cols text;
  v_counts jsonb := '{}';
begin
  if not exists (select 1 from members where user_id = auth.uid() and active and role = 'owner') then
    raise exception 'هذا الإجراء لصاحبة المشروع فقط | Only the owner can do this' using errcode = '42501';
  end if;
  if p ->> 'app' is distinct from 'zawrda' or jsonb_typeof(p -> 'tables') <> 'object' then
    raise exception 'هذا الملف ليس نسخة احتياطية من تطبيق زوردة | This file is not a Zuwardah backup';
  end if;
  if coalesce((p ->> 'format')::int, 0) > 2 then
    raise exception 'هذه النسخة من إصدار أحدث للتطبيق | This backup comes from a newer version of the app';
  end if;
  if jsonb_array_length(coalesce(p -> 'tables' -> 'settings', '[]')) <> 1 then
    raise exception 'النسخة ناقصة: لا توجد الإعدادات | The backup has no settings';
  end if;

  set constraints all deferred;
  execute (
    select 'truncate ' || string_agg(format('public.%I', x), ', ')
    from unnest(backup_tables()) x
    where x not in ('settings', 'doc_counters')
  );
  delete from doc_counters where true;
  delete from settings where true;

  foreach t in array backup_tables() loop
    v_rows := coalesce(p -> 'tables' -> t, '[]');
    if jsonb_array_length(v_rows) > 0 then
      select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t
        and c.column_name in (select jsonb_object_keys(v_rows -> 0));
      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)', t, v_cols, v_cols, t)
        using v_rows;
    end if;
    v_counts := v_counts || jsonb_build_object(t, jsonb_array_length(v_rows));
  end loop;
  set constraints all immediate;

  insert into audit_log (user_id, table_name, record_id, action, new_data)
  values (auth.uid(), 'all', null, 'insert', jsonb_build_object('event', 'restore_backup', 'exported_at', p ->> 'exported_at'));
  return v_counts;
end
$$;

-- «مسح كل البيانات» also clears the assets (same as 0006 otherwise)
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
  truncate task_completions, tasks, agreements, invoice_line_lots, invoice_lines, customer_payments,
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
