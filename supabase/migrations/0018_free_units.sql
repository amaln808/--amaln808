-- Units are free text (owner's request, 29 Oct 2026): «مل», «لتر», «علبة», …
-- The app suggests the usual ones and every unit typed before. The known codes
-- (kg, g, piece, liter, ml) keep their labels in both languages; anything else
-- is shown as typed.
do $$
declare
  c record;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.items'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%unit%'
  loop
    execute format('alter table public.items drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.items add constraint items_unit_check check (length(trim(unit)) between 1 and 20);
