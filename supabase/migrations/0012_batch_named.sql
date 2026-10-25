-- Owner feedback: in a production batch the materials are typed or picked like
-- recipes. A material that is new or short can be put into stock in the same
-- save (it is physically there but was never recorded), then the batch runs.

-- p: create_production_batch's payload, where each consumption row is
--    {item_id? | item_name, item_type?, unit?, qty, add_stock?: {qty, unit_cost_baisa?, expiry_date?}}
create or replace function public.create_production_batch_named(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_rows jsonb := '[]';
  c jsonb;
  v_item uuid;
  v_date date := coalesce(nullif(p ->> 'production_date', '')::date, current_date);
begin
  perform require_member();
  for c in select * from jsonb_array_elements(coalesce(p -> 'consumption', '[]')) loop
    v_item := coalesce(nullif(c ->> 'item_id', '')::uuid, material_by_name(c ->> 'item_name', c ->> 'item_type', c ->> 'unit'));
    if c ? 'add_stock' and coalesce((c -> 'add_stock' ->> 'qty')::numeric, 0) > 0 then
      perform add_opening_stock(v_item, (c -> 'add_stock' ->> 'qty')::numeric,
                                coalesce((c -> 'add_stock' ->> 'unit_cost_baisa')::numeric, 0), v_date,
                                nullif(c -> 'add_stock' ->> 'expiry_date', '')::date, null, 'أُضيف عند التصنيع');
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', c -> 'qty'));
  end loop;
  return create_production_batch(p || jsonb_build_object('consumption', v_rows));
end
$$;

revoke execute on function public.create_production_batch_named(jsonb) from public, anon;
grant execute on function public.create_production_batch_named(jsonb) to authenticated;
