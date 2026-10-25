-- Owner request: a clear «حذف» for products and materials that are no longer used.
-- An item with no history is deleted for good (with its prices and recipe, and it
-- leaves other recipes). An item with history (stock, purchases, batches, sales,
-- permits) cannot vanish without breaking those records, so it is hidden instead
-- (active = false) and its history stays. Returns 'deleted' or 'hidden'.
create or replace function public.delete_item(p_id uuid)
returns text
language plpgsql
set search_path = public
as $$
begin
  perform require_member();
  if not exists (select 1 from items where id = p_id) then
    raise exception 'الصنف غير موجود | Item not found';
  end if;
  if exists (select 1 from stock_lots where item_id = p_id)
     or exists (select 1 from stock_movements where item_id = p_id)
     or exists (select 1 from purchase_lines where item_id = p_id)
     or exists (select 1 from production_batches where product_id = p_id)
     or exists (select 1 from batch_consumption where item_id = p_id)
     or exists (select 1 from quotation_lines where product_id = p_id)
     or exists (select 1 from invoice_lines where product_id = p_id)
     or exists (select 1 from agreements where product_id = p_id) then
    update items set active = false where id = p_id;
    return 'hidden';
  end if;
  delete from channel_prices where product_id = p_id;
  delete from recipes where product_id = p_id;
  delete from recipe_components where item_id = p_id;
  delete from items where id = p_id;
  return 'deleted';
end
$$;

revoke execute on function public.delete_item(uuid) from public, anon;
grant execute on function public.delete_item(uuid) to authenticated;
