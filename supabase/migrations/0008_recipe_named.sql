-- Owner feedback: recipe materials are typed or picked like purchases. Each
-- product has its own ingredients, so an unknown name becomes a new material.

-- Active raw/packaging item with this name (case and spaces ignored), created if missing.
create or replace function public.material_by_name(p_name text, p_type text default 'raw', p_unit text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_type text := coalesce(nullif(p_type, ''), 'raw');
  v_id uuid;
begin
  perform require_member();
  if v_name is null then
    raise exception 'اسم المادة مطلوب | The material name is required';
  end if;
  if v_type not in ('raw', 'packaging') then
    raise exception 'نوع المادة غير صحيح | Invalid material type';
  end if;
  select id into v_id from items
   where active and type in ('raw', 'packaging') and lower(trim(name)) = lower(v_name) limit 1;
  if v_id is null then
    insert into items (type, name, unit, min_qty, requires_expiry)
    values (v_type, v_name, coalesce(nullif(p_unit, ''), case when v_type = 'raw' then 'kg' else 'piece' end), 0, v_type = 'raw')
    returning id into v_id;
  end if;
  return v_id;
end
$$;

-- p_components: [{item_id?, item_name?, item_type?, unit?, qty_per_unit}]
create or replace function public.save_recipe_named(p_product uuid, p_components jsonb, p_is_estimate boolean default false, p_notes text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_out jsonb := '[]';
  c jsonb;
  v_item uuid;
begin
  perform require_member();
  for c in select * from jsonb_array_elements(coalesce(p_components, '[]')) loop
    v_item := coalesce(nullif(c ->> 'item_id', '')::uuid, material_by_name(c ->> 'item_name', c ->> 'item_type', c ->> 'unit'));
    if exists (select 1 from jsonb_array_elements(v_out) o where (o ->> 'item_id')::uuid = v_item) then
      raise exception 'كل مادة مرة واحدة فقط في الوصفة | Each material only once in the recipe';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty_per_unit', c -> 'qty_per_unit'));
  end loop;
  return save_recipe(p_product, v_out, p_is_estimate, p_notes);
end
$$;

revoke execute on function public.material_by_name(text, text, text), public.save_recipe_named(uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.material_by_name(text, text, text), public.save_recipe_named(uuid, jsonb, boolean, text) to authenticated;
