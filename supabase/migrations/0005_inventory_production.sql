-- Zawrda v2 — round 1: stock lots (FEFO), purchases, adjustments, recipes, production.
-- Every function that touches stock runs in one transaction and as the caller
-- (security invoker), so row level security still applies.
-- User-facing errors: raise exception 'عربي | English' (the app shows the half for the current language).

create or replace function public.require_member()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.is_member() then
    raise exception 'غير مسموح | Not allowed' using errcode = '42501';
  end if;
end
$$;

-- ── Stock in / out ──────────────────────────────────────────────────

-- New lot + its movement. Returns the lot id.
create or replace function public.stock_in(
  p_item uuid, p_qty numeric, p_unit_cost numeric, p_date date, p_expiry date, p_lot_code text,
  p_source_type text, p_source_id uuid, p_move_type text, p_ref_type text, p_ref_id uuid,
  p_notes text default null, p_qc_status text default 'na'
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_lot uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر | Quantity must be above zero';
  end if;
  insert into stock_lots (item_id, lot_code, source_type, source_id, received_date, expiry_date,
                          qty_in, qty_remaining, unit_cost_baisa, qc_status)
  values (p_item, nullif(trim(p_lot_code), ''), p_source_type, p_source_id, p_date, p_expiry,
          round(p_qty, 3), round(p_qty, 3), round(coalesce(p_unit_cost, 0), 3), p_qc_status)
  returning id into v_lot;
  insert into stock_movements (item_id, lot_id, date, type, qty, unit_cost_baisa, ref_type, ref_id, notes)
  values (p_item, v_lot, p_date, p_move_type, round(p_qty, 3), round(coalesce(p_unit_cost, 0), 3), p_ref_type, p_ref_id, p_notes);
  return v_lot;
end
$$;

-- Takes p_qty out of an item, nearest expiry first (then oldest received).
-- Expired lots are skipped; p_sellable_only also skips lots not released by quality.
-- Returns [{lot_id, qty, unit_cost}] and refuses with a clear shortage message.
create or replace function public.stock_out(
  p_item uuid, p_qty numeric, p_date date, p_move_type text, p_ref_type text, p_ref_id uuid,
  p_notes text default null, p_sellable_only boolean default false
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_need numeric := round(p_qty, 3);
  v_take numeric;
  v_out jsonb := '[]'::jsonb;
  v_available numeric;
  v_name text;
  v_unit text;
  r record;
begin
  if v_need is null or v_need <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر | Quantity must be above zero';
  end if;
  for r in
    select l.id, l.qty_remaining, l.unit_cost_baisa
    from stock_lots l
    where l.item_id = p_item
      and l.qty_remaining > 0
      and (l.expiry_date is null or l.expiry_date >= p_date)
      and (not p_sellable_only or l.qc_status = 'passed')
    order by l.expiry_date nulls last, l.received_date, l.created_at
    for update
  loop
    exit when v_need <= 0;
    v_take := least(v_need, r.qty_remaining);
    update stock_lots set qty_remaining = qty_remaining - v_take where id = r.id;
    insert into stock_movements (item_id, lot_id, date, type, qty, unit_cost_baisa, ref_type, ref_id, notes)
    values (p_item, r.id, p_date, p_move_type, -v_take, r.unit_cost_baisa, p_ref_type, p_ref_id, p_notes);
    v_out := v_out || jsonb_build_object('lot_id', r.id, 'qty', v_take, 'unit_cost', r.unit_cost_baisa);
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    select name, unit into v_name, v_unit from items where id = p_item;
    v_available := round(p_qty, 3) - v_need;
    raise exception 'الكمية غير كافية من «%»: المطلوب % والمتاح % % | Not enough «%»: need %, available % %',
      v_name, round(p_qty, 3), v_available, v_unit, v_name, round(p_qty, 3), v_available, v_unit;
  end if;
  return v_out;
end
$$;

-- ── Stock overview (one row per item) ──────────────────────────────

create or replace view public.v_stock
with (security_invoker = true)
as
select
  i.id as item_id,
  coalesce(sum(l.qty_remaining), 0)::numeric(14, 3) as qty,
  coalesce(sum(l.qty_remaining) filter (where l.expiry_date is null or l.expiry_date >= current_date), 0)::numeric(14, 3) as usable_qty,
  coalesce(sum(l.qty_remaining) filter (where l.expiry_date < current_date), 0)::numeric(14, 3) as expired_qty,
  coalesce(round(sum(l.qty_remaining * l.unit_cost_baisa)), 0)::bigint as value_baisa,
  min(l.expiry_date) filter (where l.qty_remaining > 0 and l.expiry_date >= current_date) as nearest_expiry,
  coalesce(sum(l.qty_remaining) filter (where i.type = 'finished' and l.qc_status = 'passed'
                                          and (l.expiry_date is null or l.expiry_date >= current_date)), 0)::numeric(14, 3) as sellable_qty
from public.items i
left join public.stock_lots l on l.item_id = i.id and l.qty_remaining > 0
group by i.id;

grant select on public.v_stock to authenticated;
revoke all on public.v_stock from anon;

-- ── Purchases ───────────────────────────────────────────────────────

-- p: {supplier_id, date, supplier_invoice_no?, notes?, attachment_path?, paid_baisa?, method?,
--     lines: [{item_id, qty, unit_cost_baisa (before VAT), vat_rate?, supplier_lot_code?, expiry_date?}]}
-- Not VAT-registered: the VAT paid cannot be reclaimed, so it becomes part of the lot cost.
create or replace function public.create_purchase(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_date date := (p ->> 'date')::date;
  v_registered boolean;
  v_sub bigint := 0;
  v_vat bigint := 0;
  v_paid bigint := coalesce((p ->> 'paid_baisa')::bigint, 0);
  v_line jsonb;
  v_item record;
  v_qty numeric;
  v_cost numeric;
  v_rate numeric;
  v_line_vat numeric;
  v_lot uuid;
begin
  perform require_member();
  if jsonb_array_length(coalesce(p -> 'lines', '[]')) = 0 then
    raise exception 'يجب إضافة بند واحد على الأقل | Add at least one line';
  end if;
  select vat_registered into v_registered from settings where id = 1;

  insert into purchases (supplier_id, date, supplier_invoice_no, notes, attachment_path)
  values ((p ->> 'supplier_id')::uuid, v_date, nullif(trim(p ->> 'supplier_invoice_no'), ''),
          nullif(trim(p ->> 'notes'), ''), p ->> 'attachment_path')
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p -> 'lines') loop
    select id, name, requires_expiry, type into v_item from items where id = (v_line ->> 'item_id')::uuid;
    if v_item.id is null then
      raise exception 'صنف غير موجود | Unknown item';
    end if;
    if v_item.type = 'finished' then
      raise exception 'المنتج النهائي لا يُشترى، يُنتج | Finished products are produced, not purchased';
    end if;
    if v_item.requires_expiry and nullif(v_line ->> 'expiry_date', '') is null then
      raise exception 'تاريخ الانتهاء مطلوب لـ «%» | Expiry date is required for «%»', v_item.name, v_item.name;
    end if;
    v_qty := round((v_line ->> 'qty')::numeric, 3);
    v_cost := round((v_line ->> 'unit_cost_baisa')::numeric, 3);
    v_rate := coalesce((v_line ->> 'vat_rate')::numeric, 0);
    if v_qty is null or v_qty <= 0 or v_cost is null or v_cost < 0 then
      raise exception 'كمية أو سعر غير صحيح في «%» | Invalid quantity or price for «%»', v_item.name, v_item.name;
    end if;
    v_line_vat := round(v_qty * v_cost * v_rate / 100);
    v_sub := v_sub + round(v_qty * v_cost);
    v_vat := v_vat + v_line_vat;

    v_lot := stock_in(
      v_item.id, v_qty,
      case when v_registered then v_cost else v_cost * (1 + v_rate / 100) end,
      v_date, nullif(v_line ->> 'expiry_date', '')::date, v_line ->> 'supplier_lot_code',
      'purchase', v_id, 'purchase', 'purchase', v_id
    );
    insert into purchase_lines (purchase_id, item_id, qty, unit_cost_baisa, vat_rate, supplier_lot_code, expiry_date, lot_id)
    values (v_id, v_item.id, v_qty, v_cost, v_rate, nullif(trim(v_line ->> 'supplier_lot_code'), ''),
            nullif(v_line ->> 'expiry_date', '')::date, v_lot);
  end loop;

  update purchases set subtotal_baisa = v_sub, vat_baisa = v_vat, total_baisa = v_sub + v_vat where id = v_id;

  if v_paid > v_sub + v_vat then
    raise exception 'المبلغ المدفوع أكبر من إجمالي الفاتورة | Paid amount exceeds the invoice total';
  end if;
  if v_paid > 0 then
    insert into supplier_payments (supplier_id, purchase_id, date, amount_baisa, method)
    values ((p ->> 'supplier_id')::uuid, v_id, v_date, v_paid, coalesce(p ->> 'method', 'cash'));
  end if;
  return v_id;
end
$$;

-- Undo a purchase: only while none of its quantities have been used.
create or replace function public.delete_purchase(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform require_member();
  if exists (select 1 from stock_lots where source_type = 'purchase' and source_id = p_id and qty_remaining < qty_in) then
    raise exception 'لا يمكن الحذف: استُخدم جزء من كميات هذه الفاتورة | Cannot delete: part of this purchase has been used';
  end if;
  update purchase_lines set lot_id = null where purchase_id = p_id;
  delete from stock_movements where ref_type = 'purchase' and ref_id = p_id;
  delete from stock_lots where source_type = 'purchase' and source_id = p_id;
  delete from purchases where id = p_id; -- lines and linked payments cascade
end
$$;

-- ── Adjustments ─────────────────────────────────────────────────────

-- Correct a lot: negative = shortage/waste, positive = found extra.
create or replace function public.adjust_lot(p_lot uuid, p_delta numeric, p_type text, p_date date, p_notes text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_lot record;
begin
  perform require_member();
  if p_type not in ('adjustment', 'waste') then
    raise exception 'نوع غير صحيح | Invalid type';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'الكمية يجب ألا تكون صفراً | Quantity must not be zero';
  end if;
  if p_type = 'waste' and p_delta > 0 then
    raise exception 'التالف يُنقص الكمية فقط | Waste can only reduce stock';
  end if;
  select * into v_lot from stock_lots where id = p_lot for update;
  if v_lot.qty_remaining + p_delta < 0 then
    raise exception 'لا يمكن إنقاص أكثر من المتبقي في الدفعة (%) | Cannot remove more than the lot holds (%)',
      v_lot.qty_remaining, v_lot.qty_remaining;
  end if;
  update stock_lots
     set qty_remaining = qty_remaining + round(p_delta, 3),
         qty_in = qty_in + greatest(round(p_delta, 3), 0)
   where id = p_lot;
  insert into stock_movements (item_id, lot_id, date, type, qty, unit_cost_baisa, ref_type, ref_id, notes)
  values (v_lot.item_id, p_lot, p_date, p_type, round(p_delta, 3), v_lot.unit_cost_baisa, 'manual', null, nullif(trim(p_notes), ''));
end
$$;

-- Stock that was already in the factory before using the app (or found later).
create or replace function public.add_opening_stock(
  p_item uuid, p_qty numeric, p_unit_cost numeric, p_date date, p_expiry date, p_lot_code text, p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_item record;
begin
  perform require_member();
  select * into v_item from items where id = p_item;
  if v_item.requires_expiry and p_expiry is null then
    raise exception 'تاريخ الانتهاء مطلوب لـ «%» | Expiry date is required for «%»', v_item.name, v_item.name;
  end if;
  return stock_in(p_item, p_qty, p_unit_cost, p_date, p_expiry, p_lot_code, 'opening', null, 'adjustment', 'manual', null,
                  coalesce(nullif(trim(p_notes), ''), 'رصيد افتتاحي'),
                  case when v_item.type = 'finished' then 'pending' else 'na' end);
end
$$;

-- ── Recipes ─────────────────────────────────────────────────────────

-- Replaces a product's recipe in one go. p_components: [{item_id, qty_per_unit}]
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
  select v_recipe, (c ->> 'item_id')::uuid, round((c ->> 'qty_per_unit')::numeric, 3)
  from jsonb_array_elements(coalesce(p_components, '[]')) c
  where coalesce((c ->> 'qty_per_unit')::numeric, 0) > 0;
  return v_recipe;
end
$$;

-- ── Production ──────────────────────────────────────────────────────

-- p: {product_id, production_date, expiry_date?, qty_produced, extra_cost_baisa?, notes?,
--     consumption: [{item_id, qty}]}
-- Materials come out FEFO; the unit cost is the real cost of the lots used.
-- The finished lot waits for quality release (qc_status 'pending') before it can be sold.
create or replace function public.create_production_batch(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_no text;
  v_date date := (p ->> 'production_date')::date;
  v_qty numeric := round((p ->> 'qty_produced')::numeric, 3);
  v_extra bigint := coalesce((p ->> 'extra_cost_baisa')::bigint, 0);
  v_product record;
  v_expiry date;
  v_materials numeric := 0;
  v_c jsonb;
  v_alloc jsonb;
  v_a jsonb;
  v_lot uuid;
begin
  perform require_member();
  select * into v_product from items where id = (p ->> 'product_id')::uuid;
  if v_product.id is null or v_product.type <> 'finished' then
    raise exception 'يجب اختيار منتج نهائي | Choose a finished product';
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'الكمية المنتجة يجب أن تكون أكبر من صفر | Quantity produced must be above zero';
  end if;
  if v_extra < 0 then
    raise exception 'التكاليف الإضافية لا تكون سالبة | Extra costs cannot be negative';
  end if;
  v_expiry := coalesce(nullif(p ->> 'expiry_date', '')::date,
                       case when v_product.shelf_life_days is not null then v_date + v_product.shelf_life_days end);
  if v_expiry is not null and v_expiry <= v_date then
    raise exception 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج | Expiry must be after the production date';
  end if;

  v_no := next_doc_no('batch');
  insert into production_batches (batch_no, product_id, production_date, expiry_date, qty_produced, extra_cost_baisa, notes)
  values (v_no, v_product.id, v_date, v_expiry, v_qty, v_extra, nullif(trim(p ->> 'notes'), ''))
  returning id into v_id;

  for v_c in select * from jsonb_array_elements(coalesce(p -> 'consumption', '[]')) loop
    continue when coalesce((v_c ->> 'qty')::numeric, 0) <= 0;
    v_alloc := stock_out((v_c ->> 'item_id')::uuid, (v_c ->> 'qty')::numeric, v_date, 'production_out', 'batch', v_id, v_no);
    for v_a in select * from jsonb_array_elements(v_alloc) loop
      insert into batch_consumption (batch_id, item_id, lot_id, qty, unit_cost_baisa)
      values (v_id, (v_c ->> 'item_id')::uuid, (v_a ->> 'lot_id')::uuid, (v_a ->> 'qty')::numeric, (v_a ->> 'unit_cost')::numeric);
      v_materials := v_materials + (v_a ->> 'qty')::numeric * (v_a ->> 'unit_cost')::numeric;
    end loop;
  end loop;

  v_lot := stock_in(v_product.id, v_qty, (round(v_materials) + v_extra) / v_qty, v_date, v_expiry, v_no,
                    'production', v_id, 'production_in', 'batch', v_id, null, 'pending');

  update production_batches
     set materials_cost_baisa = round(v_materials),
         total_cost_baisa = round(v_materials) + v_extra,
         unit_cost_baisa = round((round(v_materials) + v_extra) / v_qty, 3),
         output_lot_id = v_lot
   where id = v_id;
  return v_id;
end
$$;

-- Undo a batch: materials go back to their own lots; refused once any of it was sold or used.
create or replace function public.delete_production_batch(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_batch record;
  r record;
begin
  perform require_member();
  select * into v_batch from production_batches where id = p_id;
  if exists (select 1 from stock_lots where id = v_batch.output_lot_id and qty_remaining < qty_in) then
    raise exception 'لا يمكن الحذف: بيع أو استُخدم جزء من هذه الدفعة | Cannot delete: part of this batch was sold or used';
  end if;
  for r in select lot_id, sum(qty) as qty from batch_consumption where batch_id = p_id group by lot_id loop
    update stock_lots set qty_remaining = qty_remaining + r.qty where id = r.lot_id;
  end loop;
  delete from stock_movements where ref_type = 'batch' and ref_id = p_id;
  update production_batches set output_lot_id = null where id = p_id;
  delete from stock_lots where source_type = 'production' and source_id = p_id;
  delete from production_batches where id = p_id; -- consumption cascades
end
$$;

-- ── Demo data and reset ────────────────────────────────────────────

-- Wipes every business record (not members, settings or the audit log) and restores
-- the starting channels, categories and counters. Owner only; used to remove demo data.
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
           expenses, suppliers, expense_categories
           restart identity cascade;
  update doc_counters set next_no = 1;
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

-- A small pretend factory to practise on: suppliers, materials with different expiry
-- dates (one near expiry, one expired), two products with recipes, purchases,
-- a payment, and two production batches. Refused if real items already exist.
create or replace function public.load_demo_data()
returns void
language plpgsql
set search_path = public
as $$
declare
  d date := current_date;
  s_dates uuid; s_nuts uuid; s_pack uuid;
  i_dates uuid; i_nuts uuid; i_jar250 uuid; i_jar500 uuid; i_lid uuid; i_label uuid;
  p250 uuid; p500 uuid;
begin
  perform require_member();
  if exists (select 1 from items) then
    raise exception 'توجد أصناف مسجلة. يجب مسح كل البيانات أولاً ثم تحميل البيانات التجريبية | Items already exist. Clear the data first, then load the demo';
  end if;

  insert into suppliers (name, phone, kind, notes) values ('مصنع تمور الباطنة (تجريبي)', '90000001', 'materials', 'بيانات تجريبية') returning id into s_dates;
  insert into suppliers (name, phone, kind) values ('مؤسسة المكسرات الذهبية (تجريبي)', '90000002', 'materials') returning id into s_nuts;
  insert into suppliers (name, phone, kind) values ('شركة العبوات الحديثة (تجريبي)', '90000003', 'both') returning id into s_pack;

  insert into items (type, name, name_en, unit, min_qty, requires_expiry) values ('raw', 'معجون تمر', 'Date paste', 'kg', 20, true) returning id into i_dates;
  insert into items (type, name, name_en, unit, min_qty, requires_expiry) values ('raw', 'زبدة فول سوداني', 'Peanut butter', 'kg', 10, true) returning id into i_nuts;
  insert into items (type, name, name_en, unit, min_qty) values ('packaging', 'علبة زجاج 250 جم', 'Glass jar 250 g', 'piece', 100) returning id into i_jar250;
  insert into items (type, name, name_en, unit, min_qty) values ('packaging', 'علبة زجاج 500 جم', 'Glass jar 500 g', 'piece', 100) returning id into i_jar500;
  insert into items (type, name, name_en, unit, min_qty) values ('packaging', 'غطاء معدني', 'Metal lid', 'piece', 200) returning id into i_lid;
  insert into items (type, name, name_en, unit, min_qty) values ('packaging', 'ملصق', 'Label', 'piece', 200) returning id into i_label;
  insert into items (type, name, name_en, unit, min_qty, description, weight_g, shelf_life_days)
  values ('finished', 'معجون تمر بزبدة الفول السوداني 250 جم', 'Date & peanut butter paste 250 g', 'piece', 30,
          'معجون تمر عُماني مع زبدة فول سوداني، بدون سكر مضاف', 250, 180) returning id into p250;
  insert into items (type, name, name_en, unit, min_qty, description, weight_g, shelf_life_days)
  values ('finished', 'معجون تمر بزبدة الفول السوداني 500 جم', 'Date & peanut butter paste 500 g', 'piece', 20,
          'معجون تمر عُماني مع زبدة فول سوداني، بدون سكر مضاف', 500, 180) returning id into p500;

  perform save_recipe(p250, jsonb_build_array(
    jsonb_build_object('item_id', i_dates, 'qty_per_unit', 0.175), jsonb_build_object('item_id', i_nuts, 'qty_per_unit', 0.075),
    jsonb_build_object('item_id', i_jar250, 'qty_per_unit', 1), jsonb_build_object('item_id', i_lid, 'qty_per_unit', 1),
    jsonb_build_object('item_id', i_label, 'qty_per_unit', 1)), true);
  perform save_recipe(p500, jsonb_build_array(
    jsonb_build_object('item_id', i_dates, 'qty_per_unit', 0.35), jsonb_build_object('item_id', i_nuts, 'qty_per_unit', 0.15),
    jsonb_build_object('item_id', i_jar500, 'qty_per_unit', 1), jsonb_build_object('item_id', i_lid, 'qty_per_unit', 1),
    jsonb_build_object('item_id', i_label, 'qty_per_unit', 1)), true);

  -- Two date-paste lots: the older one expires soonest and is used first
  perform create_purchase(jsonb_build_object('supplier_id', s_dates, 'date', d - 40, 'supplier_invoice_no', 'BT-1041',
    'paid_baisa', 60000, 'method', 'bank',
    'lines', jsonb_build_array(jsonb_build_object('item_id', i_dates, 'qty', 50, 'unit_cost_baisa', 1200,
      'supplier_lot_code', 'DP-2409', 'expiry_date', d + 20))));
  perform create_purchase(jsonb_build_object('supplier_id', s_dates, 'date', d - 10, 'supplier_invoice_no', 'BT-1077',
    'lines', jsonb_build_array(jsonb_build_object('item_id', i_dates, 'qty', 80, 'unit_cost_baisa', 1300,
      'supplier_lot_code', 'DP-2410', 'expiry_date', d + 150))));
  perform create_purchase(jsonb_build_object('supplier_id', s_nuts, 'date', d - 30, 'supplier_invoice_no', 'GN-552',
    'paid_baisa', 20000, 'method', 'cash',
    'lines', jsonb_build_array(jsonb_build_object('item_id', i_nuts, 'qty', 40, 'unit_cost_baisa', 2500,
      'supplier_lot_code', 'PB-77', 'expiry_date', d + 200))));
  perform create_purchase(jsonb_build_object('supplier_id', s_pack, 'date', d - 25, 'supplier_invoice_no', 'MP-310',
    'lines', jsonb_build_array(
      jsonb_build_object('item_id', i_jar250, 'qty', 500, 'unit_cost_baisa', 180),
      jsonb_build_object('item_id', i_jar500, 'qty', 300, 'unit_cost_baisa', 240),
      jsonb_build_object('item_id', i_lid, 'qty', 800, 'unit_cost_baisa', 45),
      jsonb_build_object('item_id', i_label, 'qty', 1000, 'unit_cost_baisa', 30))));
  -- A small lot that has already expired (to see the warning and record it as waste)
  perform add_opening_stock(i_nuts, 3, 2400, d - 120, d - 10, 'PB-OLD', 'بقايا قديمة (تجريبي)');
  insert into supplier_payments (supplier_id, date, amount_baisa, method, notes)
  values (s_pack, d - 5, 50000, 'bank', 'دفعة تحت الحساب (تجريبي)');

  perform create_production_batch(jsonb_build_object('product_id', p250, 'production_date', d - 7, 'qty_produced', 120,
    'extra_cost_baisa', 3000, 'notes', 'دفعة تجريبية',
    'consumption', jsonb_build_array(
      jsonb_build_object('item_id', i_dates, 'qty', 21), jsonb_build_object('item_id', i_nuts, 'qty', 9),
      jsonb_build_object('item_id', i_jar250, 'qty', 120), jsonb_build_object('item_id', i_lid, 'qty', 120),
      jsonb_build_object('item_id', i_label, 'qty', 120))));
  perform create_production_batch(jsonb_build_object('product_id', p500, 'production_date', d - 2, 'qty_produced', 60,
    'extra_cost_baisa', 2000,
    'consumption', jsonb_build_array(
      jsonb_build_object('item_id', i_dates, 'qty', 21.5), jsonb_build_object('item_id', i_nuts, 'qty', 9),
      jsonb_build_object('item_id', i_jar500, 'qty', 60), jsonb_build_object('item_id', i_lid, 'qty', 60),
      jsonb_build_object('item_id', i_label, 'qty', 60))));

  insert into tasks (title, category, recurrence, start_date, due_time)
  values ('تعقيم أدوات وخط التعبئة (تجريبي)', 'cleaning', 'daily', d - 14, '07:30');
  insert into tasks (title, category, recurrence, start_date) values ('جرد المخزون (تجريبي)', 'inventory', 'weekly', d - 13);
  insert into agreements (kind, title, party, start_date, end_date, alert_days, amount_baisa)
  values ('contract', 'عقد إيجار المصنع (تجريبي)', 'مالك العقار', d - 340, d + 25, 30, 3600000);
  insert into agreements (kind, title, party, product_id, reference_no, start_date, end_date)
  values ('product_permit', 'تصريح بيع 250 جم (تجريبي)', 'جهة الرقابة الغذائية', p250, 'FS-1001', d - 100, d + 265);
end
$$;

-- ── Grants ──────────────────────────────────────────────────────────

revoke execute on all functions in schema public from public, anon;
grant execute on function public.ping() to anon, authenticated;
grant execute on function
  public.is_member(), public.require_member(), public.next_doc_no(text), public.storage_usage(),
  public.product_permit_valid(uuid, date),
  public.stock_in(uuid, numeric, numeric, date, date, text, text, uuid, text, text, uuid, text, text),
  public.stock_out(uuid, numeric, date, text, text, uuid, text, boolean),
  public.create_purchase(jsonb), public.delete_purchase(uuid),
  public.adjust_lot(uuid, numeric, text, date, text),
  public.add_opening_stock(uuid, numeric, numeric, date, date, text, text),
  public.save_recipe(uuid, jsonb, boolean, text),
  public.create_production_batch(jsonb), public.delete_production_batch(uuid),
  public.reset_all_data(), public.load_demo_data()
to authenticated;
