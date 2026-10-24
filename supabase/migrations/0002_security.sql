-- Zawrda v2 — security: membership, row level security, audit trail, storage.
-- Rule: nobody reads or writes anything unless they are an active member.
-- Sign-ups are disabled in the dashboard; even so, a stranger account is not a member.

-- ── Helpers ─────────────────────────────────────────────────────────

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m where m.user_id = auth.uid() and m.active
  )
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Every change to a business table is written here by the database itself,
-- so the history cannot be skipped or edited from the app.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then
    return new; -- nothing really changed
  end if;
  insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'kind', rec ->> 'user_id'),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end
$$;

-- The first account created in the project becomes the owner (member).
-- Any later account is NOT a member until the owner adds it on purpose.
create or replace function public.bootstrap_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.members) then
    insert into public.members (user_id, display_name, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email), 'owner');
  end if;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.bootstrap_owner();

-- If the owner account already existed before this migration ran
insert into public.members (user_id, display_name, role)
select u.id, u.email, 'owner'
from auth.users u
where not exists (select 1 from public.members)
order by u.created_at
limit 1;

-- Keep-alive endpoint for the free plan (called by GitHub Actions / cron-job.org).
-- Returns 1 and reads no data.
create or replace function public.ping()
returns int
language sql
stable
as $$ select 1 $$;

-- Next document number, reserved inside the caller's transaction (no gaps on failure).
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
           else s.batch_prefix
         end
    into prefix
    from public.settings s where s.id = 1;
  return coalesce(prefix, '') || lpad(n::text, 4, '0');
end
$$;

-- Used space, for the "70% of the free plan" warning in settings.
create or replace function public.storage_usage()
returns table (db_bytes bigint, files_bytes bigint, files_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select
    pg_database_size(current_database())::bigint,
    coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0)::bigint,
    (select count(*) from storage.objects)::bigint;
end
$$;

-- ── Triggers, RLS and grants on every business table ───────────────

do $$
declare
  t text;
  business_tables text[] := array[
    'members', 'settings', 'doc_counters', 'expense_categories', 'suppliers', 'items',
    'stock_lots', 'stock_movements', 'purchases', 'purchase_lines', 'supplier_payments',
    'recipes', 'recipe_components', 'production_batches', 'batch_consumption', 'quality_checks',
    'channels', 'channel_prices', 'customers', 'sales_invoices', 'quotations', 'quotation_lines',
    'invoice_lines', 'invoice_line_lots', 'customer_payments', 'expenses'
  ];
begin
  foreach t in array business_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    if t <> 'doc_counters' then
      execute format(
        'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;

  -- Members: readable by members; changed only by the owner (later phase UI) or SQL
  foreach t in array array_remove(business_tables, 'members') loop
    execute format('create policy members_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
end
$$;

create policy members_read on public.members for select to authenticated using (public.is_member());

-- Settings is a single row: no inserting or deleting from the app
create policy settings_no_insert on public.settings as restrictive for insert to authenticated with check (false);
create policy settings_no_delete on public.settings as restrictive for delete to authenticated using (false);

-- Audit log: members read; nobody writes directly (only the trigger), nobody edits or deletes
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (public.is_member());

alter table public.schema_migrations enable row level security;

-- Least privilege: anonymous visitors get nothing except ping()
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke all on public.schema_migrations from authenticated;
revoke insert, update, delete on public.members from authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.next_doc_no(text) to authenticated;
grant execute on function public.storage_usage() to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- New tables/functions created later are not exposed to anon by default
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ── Storage: four private buckets, members only ────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('products', 'products', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('lab-certificates', 'lab-certificates', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('branding', 'branding', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy zawrda_files_read on storage.objects for select to authenticated
  using (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding') and public.is_member());
create policy zawrda_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding') and public.is_member());
create policy zawrda_files_update on storage.objects for update to authenticated
  using (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding') and public.is_member())
  with check (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding') and public.is_member());
create policy zawrda_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding') and public.is_member());
