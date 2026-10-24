-- Zawrda v2 — scheduled tasks, agreements/licences and product sale permits.

-- Agreements, contracts, licences and product sale permits, each with an end date
-- and an alert window. A product may only be sold while it has a valid permit.
create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'contract' check (kind in ('product_permit', 'contract', 'license', 'other')),
  title text not null,
  party text,
  product_id uuid references public.items (id),
  reference_no text,
  start_date date,
  end_date date not null,
  alert_days int not null default 30 check (alert_days between 0 and 365),
  amount_baisa bigint check (amount_baisa >= 0),
  file_path text,
  notes text,
  -- set when a renewal replaces this record (the old one stays as history)
  renewed_by_id uuid references public.agreements (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (kind <> 'product_permit' or product_id is not null),
  check (start_date is null or end_date >= start_date)
);
create index agreements_end_idx on public.agreements (end_date) where active;
create index agreements_product_idx on public.agreements (product_id) where kind = 'product_permit';

-- Factory tasks: one-off or repeating (daily / weekly / monthly / yearly, every N).
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  category text not null default 'general' check (category in (
    'general', 'production', 'quality', 'cleaning', 'inventory', 'maintenance', 'finance', 'admin'
  )),
  recurrence text not null default 'once' check (recurrence in ('once', 'daily', 'weekly', 'monthly', 'yearly')),
  interval_n int not null default 1 check (interval_n between 1 and 99),
  start_date date not null,
  end_date date,
  -- weekly only: 0 = Sunday … 6 = Saturday; empty = the start date's weekday
  weekdays smallint[] not null default '{}' check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  due_time time,
  agreement_id uuid references public.agreements (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (end_date is null or end_date >= start_date)
);

-- One row per finished occurrence (task + the date it was due)
create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  due_date date not null,
  done_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (task_id, due_date)
);
create index task_completions_due_idx on public.task_completions (due_date);

-- True when the product has an active sale permit covering the date.
-- Used by the sales functions (phase 4) to refuse selling without a permit.
create or replace function public.product_permit_valid(p_product uuid, p_date date default current_date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.agreements a
    where a.kind = 'product_permit'
      and a.product_id = p_product
      and a.active
      and a.end_date >= p_date
      and coalesce(a.start_date, p_date) <= p_date
  )
$$;

do $$
declare
  t text;
begin
  foreach t in array array['agreements', 'tasks', 'task_completions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create policy members_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

revoke execute on function public.product_permit_valid(uuid, date) from public, anon;
grant execute on function public.product_permit_valid(uuid, date) to authenticated;

-- Private folder for agreement and permit documents (PDF or photo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists zawrda_files_read on storage.objects;
drop policy if exists zawrda_files_insert on storage.objects;
drop policy if exists zawrda_files_update on storage.objects;
drop policy if exists zawrda_files_delete on storage.objects;

create policy zawrda_files_read on storage.objects for select to authenticated
  using (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding', 'documents') and public.is_member());
create policy zawrda_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding', 'documents') and public.is_member());
create policy zawrda_files_update on storage.objects for update to authenticated
  using (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding', 'documents') and public.is_member())
  with check (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding', 'documents') and public.is_member());
create policy zawrda_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('products', 'lab-certificates', 'receipts', 'branding', 'documents') and public.is_member());
