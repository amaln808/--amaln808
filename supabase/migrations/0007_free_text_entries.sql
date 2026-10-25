-- Owner feedback after round 1: the supplier type and the purchase form start
-- empty and grow from what is typed. Earlier entries are offered as choices.

-- 1. Supplier type is free text (e.g. «تمور», «عبوات», «كهرباء»), optional.
alter table public.suppliers drop constraint if exists suppliers_kind_check;
alter table public.suppliers alter column kind drop not null, alter column kind drop default;
update public.suppliers
   set kind = case kind when 'materials' then 'مواد وتغليف' when 'expenses' then 'مصروفات وخدمات' when 'both' then 'مواد ومصروفات' else kind end
 where kind in ('materials', 'expenses', 'both');

-- 2. A purchase typed with names: an unknown supplier or item is created in the
--    same transaction, then create_purchase runs as before.
--    p.supplier_name (when no supplier_id); lines[].item_name, item_type ('raw'|'packaging'), unit (when no item_id).
create or replace function public.create_purchase_named(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := nullif(p ->> 'supplier_id', '')::uuid;
  v_name text;
  v_lines jsonb := '[]';
  v_line jsonb;
  v_item uuid;
  v_type text;
begin
  perform require_member();
  if v_supplier is null then
    v_name := nullif(trim(p ->> 'supplier_name'), '');
    if v_name is null then
      raise exception 'اسم المورد مطلوب | The supplier name is required';
    end if;
    select id into v_supplier from suppliers where active and lower(trim(name)) = lower(v_name) limit 1;
    if v_supplier is null then
      insert into suppliers (name) values (v_name) returning id into v_supplier;
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p -> 'lines', '[]')) loop
    v_item := nullif(v_line ->> 'item_id', '')::uuid;
    if v_item is null then
      v_name := nullif(trim(v_line ->> 'item_name'), '');
      v_type := coalesce(v_line ->> 'item_type', 'raw');
      if v_name is null then
        raise exception 'اسم الصنف مطلوب في كل بند | Every line needs an item name';
      end if;
      if v_type not in ('raw', 'packaging') then
        raise exception 'نوع الصنف غير صحيح | Invalid item type';
      end if;
      select id into v_item from items
       where active and type in ('raw', 'packaging') and lower(trim(name)) = lower(v_name) limit 1;
      if v_item is null then
        insert into items (type, name, unit, min_qty, requires_expiry)
        values (v_type, v_name, coalesce(nullif(v_line ->> 'unit', ''), 'kg'), 0, v_type = 'raw')
        returning id into v_item;
      end if;
    end if;
    v_lines := v_lines || jsonb_build_array(v_line || jsonb_build_object('item_id', v_item));
  end loop;

  return create_purchase(p || jsonb_build_object('supplier_id', v_supplier, 'lines', v_lines));
end
$$;

revoke execute on function public.create_purchase_named(jsonb) from public, anon;
grant execute on function public.create_purchase_named(jsonb) to authenticated;

-- 3. Demo data with typed supplier types (same function as 0005 otherwise).
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

  insert into suppliers (name, phone, kind, notes) values ('مصنع تمور الباطنة (تجريبي)', '90000001', 'تمور', 'بيانات تجريبية') returning id into s_dates;
  insert into suppliers (name, phone, kind) values ('مؤسسة المكسرات الذهبية (تجريبي)', '90000002', 'مكسرات') returning id into s_nuts;
  insert into suppliers (name, phone, kind) values ('شركة العبوات الحديثة (تجريبي)', '90000003', 'عبوات وتغليف') returning id into s_pack;

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
