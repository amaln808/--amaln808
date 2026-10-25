-- Owner decision (25 Oct 2026): no quality-check step. A production batch can be
-- sold as soon as it is made; the sale permit rule stays. Quality tables remain
-- (unused) so nothing is lost.

-- Finished lots from production are released at once.
create or replace function public.release_production_lot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source_type = 'production' then
    new.qc_status := 'passed';
  end if;
  return new;
end
$$;

drop trigger if exists release_production_lot on public.stock_lots;
create trigger release_production_lot before insert on public.stock_lots
  for each row execute function public.release_production_lot();

update public.stock_lots set qc_status = 'passed' where source_type = 'production' and qc_status <> 'passed';

-- Old quality checks no longer change whether a batch can be sold.
create or replace function public.sync_batch_qc(p_batch uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform p_batch;
end
$$;

-- The brand is written «Zuwardah» in English.
alter table public.settings alter column company_name_en set default 'Zuwardah';
update public.settings set company_name_en = 'Zuwardah' where id = 1 and company_name_en = 'Zawrda';

-- Demo factory without quality checks (same as 0010 otherwise).
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
  b250 uuid; b500 uuid; ch_relief uuid; ch_retail uuid; ch_pharm uuid; ch_sport uuid;
  c1 uuid; c2 uuid; c3 uuid; q1 uuid; q2 uuid; inv2 uuid;
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

  b250 := create_production_batch(jsonb_build_object('product_id', p250, 'production_date', d - 7, 'qty_produced', 120,
    'extra_cost_baisa', 3000, 'notes', 'دفعة تجريبية',
    'consumption', jsonb_build_array(
      jsonb_build_object('item_id', i_dates, 'qty', 21), jsonb_build_object('item_id', i_nuts, 'qty', 9),
      jsonb_build_object('item_id', i_jar250, 'qty', 120), jsonb_build_object('item_id', i_lid, 'qty', 120),
      jsonb_build_object('item_id', i_label, 'qty', 120))));
  b500 := create_production_batch(jsonb_build_object('product_id', p500, 'production_date', d - 2, 'qty_produced', 60,
    'extra_cost_baisa', 2000,
    'consumption', jsonb_build_array(
      jsonb_build_object('item_id', i_dates, 'qty', 21.5), jsonb_build_object('item_id', i_nuts, 'qty', 9),
      jsonb_build_object('item_id', i_jar500, 'qty', 60), jsonb_build_object('item_id', i_lid, 'qty', 60),
      jsonb_build_object('item_id', i_label, 'qty', 60))));

  insert into tasks (title, category, recurrence, start_date, due_time)
  values ('تعقيم أدوات وخط التعبئة (تجريبي)', 'نظافة وتعقيم', 'daily', d - 14, '07:30');
  insert into tasks (title, category, recurrence, start_date) values ('جرد المخزون (تجريبي)', 'مخزون', 'weekly', d - 13);
  insert into agreements (kind, title, party, start_date, end_date, alert_days, amount_baisa)
  values ('contract', 'عقد إيجار المصنع (تجريبي)', 'مالك العقار', d - 340, d + 25, 30, 3600000);
  insert into agreements (kind, title, party, product_id, reference_no, start_date, end_date)
  values ('product_permit', 'تصريح بيع 250 جم (تجريبي)', 'جهة الرقابة الغذائية', p250, 'FS-1001', d - 100, d + 265);

  select id into ch_relief from channels where name = 'إغاثة';
  select id into ch_retail from channels where name = 'تجزئة';
  select id into ch_pharm from channels where name = 'صيدليات';
  select id into ch_sport from channels where name = 'تغذية رياضية';
  insert into channel_prices (channel_id, product_id, price_baisa) values
    (ch_relief, p250, 1100), (ch_retail, p250, 1500), (ch_pharm, p250, 1700), (ch_sport, p250, 1900),
    (ch_relief, p500, 2000), (ch_retail, p500, 2800), (ch_pharm, p500, 3200), (ch_sport, p500, 3500);

  insert into customers (name, phone, channel_id, address) values ('جمعية الخير (تجريبي)', '90000011', ch_relief, 'مسقط') returning id into c1;
  insert into customers (name, phone, channel_id) values ('صيدلية الشفاء (تجريبي)', '90000012', ch_pharm) returning id into c2;
  insert into customers (name, phone, channel_id) values ('نادي القوة (تجريبي)', '90000013', ch_sport) returning id into c3;

  -- Accepted quotation → invoice, partly paid
  q1 := save_quotation(jsonb_build_object('customer_id', c1, 'date', d - 4, 'status', 'sent',
    'lines', jsonb_build_array(jsonb_build_object('product_id', p250, 'qty', 40, 'unit_price_baisa', 1100))));
  perform accept_quotation(q1, d - 3);
  insert into customer_payments (customer_id, invoice_id, date, amount_baisa, method, notes)
  select c1, invoice_id, d - 1, 20000, 'bank', 'دفعة أولى (تجريبي)' from quotations where id = q1;
  -- Direct sale, already past its due date
  inv2 := create_invoice(jsonb_build_object('customer_id', c2, 'date', d - 2, 'due_date', d - 1, 'discount_baisa', 1000,
    'lines', jsonb_build_array(jsonb_build_object('product_id', p250, 'qty', 15, 'unit_price_baisa', 1700))));
  -- Open quotation for the 500 g jar: it can be quoted, but not invoiced until it has a sale permit
  q2 := save_quotation(jsonb_build_object('customer_id', c3, 'date', d, 'status', 'sent',
    'lines', jsonb_build_array(jsonb_build_object('product_id', p500, 'qty', 20, 'unit_price_baisa', 3500))));
end
$$;
