-- Recipes can be typed in grams / millilitres (owner's request, 30 Oct 2026); they
-- are stored in the material's own unit (kg, litre). Half a gram per jar is
-- 0.0005 kg, so a recipe keeps 6 decimals. Batch quantities stay at 3 (whole
-- grams): planFromRecipe rounds the totals.

alter table public.recipe_components alter column qty_per_unit type numeric(14, 6);

-- Same as 0005, rounding to 6 decimals instead of 3
create or replace function public.save_recipe(p_product uuid, p_components jsonb, p_is_estimate boolean default false, p_notes text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_recipe uuid;
begin
  perform require_member();
  insert into recipes (product_id, is_estimate, notes) values (p_product, p_is_estimate, p_notes)
  on conflict (product_id) do update set is_estimate = excluded.is_estimate, notes = excluded.notes
  returning id into v_recipe;
  delete from recipe_components where recipe_id = v_recipe;
  insert into recipe_components (recipe_id, item_id, qty_per_unit)
  select v_recipe, (c ->> 'item_id')::uuid, round((c ->> 'qty_per_unit')::numeric, 6)
  from jsonb_array_elements(coalesce(p_components, '[]')) c
  where coalesce((c ->> 'qty_per_unit')::numeric, 0) > 0;
  return v_recipe;
end
$$;
