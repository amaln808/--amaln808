-- Round 4: the owner's Excel backup. export_backup() returns every business table
-- in one answer (no page limits); restore_backup() puts a backup back in one
-- transaction: all or nothing. Photos stay in Storage (paths in the rows still
-- point to them). Members, the audit log and the migration list are never touched.

-- Foreign keys are checked at the end of the transaction while restoring, so the
-- tables can be filled in any order (lots ↔ batches point at each other).
do $$
declare
  c record;
begin
  for c in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = con.connamespace
    where con.contype = 'f' and n.nspname = 'public' and not con.condeferrable
  loop
    execute format('alter table public.%I alter constraint %I deferrable initially immediate', c.relname, c.conname);
  end loop;
end
$$;

-- Every table a backup holds, parents first.
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
    'agreements', 'tasks', 'task_completions'
  ]
$$;

-- {app: 'zawrda', format: 2, exported_at, tables: {name: [rows…]}}
create or replace function public.export_backup()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  t text;
  v_rows jsonb;
  v_tables jsonb := '{}';
begin
  perform require_member();
  foreach t in array backup_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x', t) into v_rows;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
  end loop;
  return jsonb_build_object('app', 'zawrda', 'format', 2, 'exported_at', now(), 'tables', v_tables);
end
$$;

-- Replaces all business data with the backup. Owner only. Columns the backup does
-- not have (a backup older than a later migration) take their default value.
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
  truncate task_completions, tasks, agreements, invoice_line_lots, invoice_lines, customer_payments,
           quotation_lines, quotations, sales_invoices, customers, channel_prices, channels,
           quality_checks, batch_consumption, production_batches, recipe_components, recipes,
           supplier_payments, purchase_lines, purchases, stock_movements, stock_lots, items,
           expenses, suppliers, expense_categories;
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

revoke execute on function public.backup_tables(), public.export_backup(), public.restore_backup(jsonb) from public, anon;
grant execute on function public.backup_tables(), public.export_backup(), public.restore_backup(jsonb) to authenticated;
