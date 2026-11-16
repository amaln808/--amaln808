-- الهمة — personal & work tasks, achievements and numeric goals.
-- Every row belongs to the signed-in user (user_id = auth.uid()); row level
-- security means nobody sees anyone else's rows, and anon sees nothing at all.

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Tasks: one-off or repeating (daily / weekly / monthly / yearly, every N)
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  notes text,
  scope text not null default 'work' check (scope in ('work', 'personal')),
  category text,
  important boolean not null default false,
  recurrence text not null default 'once' check (recurrence in ('once', 'daily', 'weekly', 'monthly', 'yearly')),
  interval_n int not null default 1 check (interval_n between 1 and 99),
  start_date date not null default current_date,
  end_date date,
  -- weekly only: 0 = Sunday … 6 = Saturday; empty = the start date's weekday
  weekdays smallint[] not null default '{}' check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  due_time time,
  -- stopped from this date on (earlier dates still count in the performance figures)
  archived_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index tasks_user_idx on public.tasks (user_id);

-- One row per finished occurrence (task + the date it was due), with an optional note on what was achieved
create table public.task_done (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  due_date date not null,
  done_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, due_date)
);
create index task_done_user_due_idx on public.task_done (user_id, due_date);

-- Goals with a number: "sell 500 jars by the end of December"
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  scope text not null default 'work' check (scope in ('work', 'personal')),
  unit text,
  target numeric(14, 2) not null check (target > 0),
  start_date date not null default current_date,
  end_date date not null,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index goals_user_idx on public.goals (user_id);

-- Progress recorded towards a goal (negative amounts correct an earlier entry)
create table public.goal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  date date not null default current_date,
  amount numeric(14, 2) not null check (amount <> 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goal_entries_goal_idx on public.goal_entries (goal_id, date);

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'task_done', 'goals', 'goal_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- A finished occurrence or progress entry must point at the user's own task / goal
create or replace function public.check_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'task_done' then
    if not exists (select 1 from public.tasks where id = new.task_id and user_id = new.user_id) then
      raise exception 'المهمة غير موجودة | Task not found';
    end if;
  elsif not exists (select 1 from public.goals where id = new.goal_id and user_id = new.user_id) then
    raise exception 'الهدف غير موجود | Goal not found';
  end if;
  return new;
end
$$;
create trigger check_owner before insert or update on public.task_done for each row execute function public.check_owner();
create trigger check_owner before insert or update on public.goal_entries for each row execute function public.check_owner();

-- Keep-alive for the free plan: returns 1 and reads no data
create or replace function public.ping() returns int language sql stable set search_path = '' as $$ select 1 $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.check_owner() from public, anon, authenticated;
