-- Zawrda v2 — round 2: quality release, channels and customers, quotations,
-- invoices (FEFO from released lots, sale permit required), voiding.
-- Customer payments are plain rows (optionally linked to an invoice); the app
-- settles unlinked payments against the oldest invoices (allocatePayments).

-- ── Quality ─────────────────────────────────────────────────────────

-- The batch's finished lot follows its latest check: pass → sellable, fail → blocked,
-- pending or no check → waiting.
create or replace function public.sync_batch_qc(p_batch uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_result text;
begin
  select result into v_result from quality_checks
   where batch_id = p_batch order by check_date desc, created_at desc limit 1;
  update stock_lots
     set qc_status = case v_result when 'pass' then 'passed' when 'fail' then 'failed' else 'pending' end
   where id = (select output_lot_id from production_batches where id = p_batch);
end
$$;

-- p: {id?, batch_id, check_date, lab_name?, moisture_pct?, aflatoxin_ppb?, result, certificate_path?, notes?}
create or replace function public.record_quality_check(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_batch uuid := (p ->> 'batch_id')::uuid;
begin
  perform require_member();
  if not exists (select 1 from production_batches where id = v_batch) then
    raise exception 'دفعة الإنتاج غير موجودة | Production batch not found';
  end if;
  if coalesce(p ->> 'result', 'pending') not in ('pending', 'pass', 'fail') then
    raise exception 'نتيجة غير صحيحة | Invalid result';
  end if;
  if v_id is not null and exists (select 1 from quality_checks where id = v_id) then
    update quality_checks set
      check_date = (p ->> 'check_date')::date,
      lab_name = nullif(trim(p ->> 'lab_name'), ''),
      moisture_pct = nullif(p ->> 'moisture_pct', '')::numeric,
      aflatoxin_ppb = nullif(p ->> 'aflatoxin_ppb', '')::numeric,
      result = coalesce(p ->> 'result', 'pending'),
      certificate_path = nullif(p ->> 'certificate_path', ''),
      notes = nullif(trim(p ->> 'notes'), '')
    where id = v_id;
  else
    insert into quality_checks (id, batch_id, check_date, lab_name, moisture_pct, aflatoxin_ppb, result, certificate_path, notes)
    values (coalesce(v_id, gen_random_uuid()), v_batch, (p ->> 'check_date')::date, nullif(trim(p ->> 'lab_name'), ''),
            nullif(p ->> 'moisture_pct', '')::numeric, nullif(p ->> 'aflatoxin_ppb', '')::numeric,
            coalesce(p ->> 'result', 'pending'), nullif(p ->> 'certificate_path', ''), nullif(trim(p ->> 'notes'), ''))
    returning id into v_id;
  end if;
  perform sync_batch_qc(v_batch);
  return v_id;
end
$$;

create or replace function public.delete_quality_check(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_batch uuid;
begin
  perform require_member();
  delete from quality_checks where id = p_id returning batch_id into v_batch;
  if v_batch is not null then
    perform sync_batch_qc(v_batch);
  end if;
end
$$;

-- ── Names typed by hand ─────────────────────────────────────────────

create or replace function public.channel_by_name(p_name text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_id uuid;
begin
  perform require_member();
  if v_name is null then
    return null;
  end if;
  select id into v_id from channels where lower(trim(name)) = lower(v_name) order by active desc limit 1;
  if v_id is null then
    insert into channels (name, sort_order)
    values (v_name, coalesce((select max(sort_order) from channels), 0) + 1)
    returning id into v_id;
  else
    update channels set active = true where id = v_id and not active;
  end if;
  return v_id;
end
$$;

create or replace function public.customer_by_name(p_name text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_id uuid;
begin
  perform require_member();
  if v_name is null then
    raise exception 'اسم العميل مطلوب | The customer name is required';
  end if;
  select id into v_id from customers where active and lower(trim(name)) = lower(v_name) limit 1;
  if v_id is null then
    insert into customers (name) values (v_name) returning id into v_id;
  end if;
  return v_id;
end
$$;

-- ── Sales lines ─────────────────────────────────────────────────────

-- Prices the lines of a quotation or invoice. The invoice discount is shared
-- across lines in proportion to their value (the last line takes the rounding),
-- then VAT is charged per line on the amount after discount.
-- Not VAT-registered: every line is 0%.
-- Returns [{product_id, qty, unit_price_baisa, gross, discount, vat_rate, vat}] and the totals.
create or replace function public.price_sales_lines(p_lines jsonb, p_discount bigint)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_registered boolean;
  v_default numeric;
  v_gross_total bigint := 0;
  v_discount bigint := greatest(coalesce(p_discount, 0), 0);
  v_left bigint;
  v_out jsonb := '[]';
  v_n int;
  v_i int := 0;
  l jsonb;
  v_item record;
  v_qty numeric;
  v_price bigint;
  v_gross bigint;
  v_disc bigint;
  v_rate numeric;
  v_vat bigint;
  v_vat_total bigint := 0;
begin
  select vat_registered, default_vat_rate into v_registered, v_default from settings where id = 1;
  v_n := jsonb_array_length(coalesce(p_lines, '[]'));
  if v_n = 0 then
    raise exception 'يجب إضافة بند واحد على الأقل | Add at least one line';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_gross_total := v_gross_total + round(round((l ->> 'qty')::numeric, 3) * (l ->> 'unit_price_baisa')::bigint);
  end loop;
  if v_discount > v_gross_total then
    raise exception 'الخصم أكبر من المجموع | The discount is larger than the subtotal';
  end if;
  v_left := v_discount;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_i := v_i + 1;
    select id, name, type, vat_rate into v_item from items where id = (l ->> 'product_id')::uuid;
    if v_item.id is null or v_item.type <> 'finished' then
      raise exception 'المنتج غير موجود | Unknown product';
    end if;
    v_qty := round((l ->> 'qty')::numeric, 3);
    v_price := (l ->> 'unit_price_baisa')::bigint;
    if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 then
      raise exception 'كمية أو سعر غير صحيح في «%» | Invalid quantity or price for «%»', v_item.name, v_item.name;
    end if;
    v_gross := round(v_qty * v_price);
    v_disc := case when v_i = v_n then v_left
                   when v_gross_total = 0 then 0
                   else round(v_discount::numeric * v_gross / v_gross_total) end;
    v_left := v_left - v_disc;
    v_rate := case when v_registered then coalesce(nullif(l ->> 'vat_rate', '')::numeric, v_item.vat_rate, v_default) else 0 end;
    v_vat := round((v_gross - v_disc) * v_rate / 100);
    v_vat_total := v_vat_total + v_vat;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'product_id', v_item.id, 'name', v_item.name, 'qty', v_qty, 'unit_price_baisa', v_price,
      'gross', v_gross, 'discount', v_disc, 'vat_rate', v_rate, 'vat', v_vat));
  end loop;
  return jsonb_build_object('lines', v_out, 'subtotal', v_gross_total, 'discount', v_discount,
                            'vat', v_vat_total, 'total', v_gross_total - v_discount + v_vat_total);
end
$$;

-- ── Quotations ──────────────────────────────────────────────────────

-- p: {id?, customer_id? | customer_name, date, valid_until?, discount_baisa?, notes?, status?,
--     lines: [{product_id, qty, unit_price_baisa, vat_rate?}]}
-- Quotations never touch stock, so a product without a permit or released lot can be quoted.
create or replace function public.save_quotation(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_customer uuid := coalesce(nullif(p ->> 'customer_id', '')::uuid, customer_by_name(p ->> 'customer_name'));
  v_date date := coalesce(nullif(p ->> 'date', '')::date, current_date);
  v_valid date;
  v_priced jsonb;
  v_status text;
  l jsonb;
begin
  perform require_member();
  v_priced := price_sales_lines(p -> 'lines', coalesce((p ->> 'discount_baisa')::bigint, 0));
  v_valid := coalesce(nullif(p ->> 'valid_until', '')::date,
                      v_date + (select quote_validity_days from settings where id = 1));
  if v_id is not null then
    select status into v_status from quotations where id = v_id for update;
    if v_status is null then
      raise exception 'عرض السعر غير موجود | Quotation not found';
    end if;
    if v_status in ('accepted', 'rejected') then
      raise exception 'لا يمكن تعديل عرض مقبول أو مرفوض | An accepted or rejected quotation cannot be edited';
    end if;
    update quotations set customer_id = v_customer, date = v_date, valid_until = v_valid,
           status = coalesce(nullif(p ->> 'status', ''), status),
           subtotal_baisa = (v_priced ->> 'subtotal')::bigint, discount_baisa = (v_priced ->> 'discount')::bigint,
           vat_baisa = (v_priced ->> 'vat')::bigint, total_baisa = (v_priced ->> 'total')::bigint,
           notes = nullif(trim(p ->> 'notes'), '')
     where id = v_id;
    delete from quotation_lines where quotation_id = v_id;
  else
    insert into quotations (quote_no, customer_id, date, valid_until, status, subtotal_baisa, discount_baisa, vat_baisa, total_baisa, notes)
    values (next_doc_no('quote'), v_customer, v_date, v_valid, coalesce(nullif(p ->> 'status', ''), 'draft'),
            (v_priced ->> 'subtotal')::bigint, (v_priced ->> 'discount')::bigint, (v_priced ->> 'vat')::bigint,
            (v_priced ->> 'total')::bigint, nullif(trim(p ->> 'notes'), ''))
    returning id into v_id;
  end if;
  for l in select * from jsonb_array_elements(v_priced -> 'lines') loop
    insert into quotation_lines (quotation_id, product_id, qty, unit_price_baisa, vat_rate)
    values (v_id, (l ->> 'product_id')::uuid, (l ->> 'qty')::numeric, (l ->> 'unit_price_baisa')::bigint, (l ->> 'vat_rate')::numeric);
  end loop;
  return v_id;
end
$$;

create or replace function public.set_quotation_status(p_id uuid, p_status text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  perform require_member();
  if p_status not in ('draft', 'sent', 'rejected') then
    raise exception 'حالة غير صحيحة | Invalid status';
  end if;
  select status into v_status from quotations where id = p_id for update;
  if v_status = 'accepted' then
    raise exception 'العرض مقبول وله فاتورة | The quotation is accepted and invoiced';
  end if;
  update quotations set status = p_status where id = p_id;
end
$$;

-- ── Invoices ────────────────────────────────────────────────────────

-- p: {customer_id? | customer_name, date, due_date?, discount_baisa?, notes?, quotation_id?,
--     lines: [{product_id, qty, unit_price_baisa, vat_rate?}]}
-- Each product needs a valid sale permit on the invoice date; the quantity comes out of
-- quality-released, unexpired lots, nearest expiry first, and every lot used is recorded.
create or replace function public.create_invoice(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_customer uuid := coalesce(nullif(p ->> 'customer_id', '')::uuid, customer_by_name(p ->> 'customer_name'));
  v_date date := coalesce(nullif(p ->> 'date', '')::date, current_date);
  v_priced jsonb;
  v_line uuid;
  l jsonb;
  a jsonb;
begin
  perform require_member();
  if not exists (select 1 from customers where id = v_customer) then
    raise exception 'العميل غير موجود | Customer not found';
  end if;
  v_priced := price_sales_lines(p -> 'lines', coalesce((p ->> 'discount_baisa')::bigint, 0));
  for l in select * from jsonb_array_elements(v_priced -> 'lines') loop
    if not product_permit_valid((l ->> 'product_id')::uuid, v_date) then
      raise exception 'لا يوجد تصريح بيع ساري لـ «%» بتاريخ الفاتورة | No valid sale permit for «%» on the invoice date',
        l ->> 'name', l ->> 'name';
    end if;
  end loop;

  insert into sales_invoices (invoice_no, quotation_id, customer_id, channel_id, date, due_date, status,
                              subtotal_baisa, discount_baisa, vat_baisa, total_baisa, notes)
  values (next_doc_no('invoice'), nullif(p ->> 'quotation_id', '')::uuid, v_customer,
          (select channel_id from customers where id = v_customer), v_date,
          coalesce(nullif(p ->> 'due_date', '')::date, v_date + (select invoice_due_days from settings where id = 1)),
          'issued', (v_priced ->> 'subtotal')::bigint, (v_priced ->> 'discount')::bigint,
          (v_priced ->> 'vat')::bigint, (v_priced ->> 'total')::bigint, nullif(trim(p ->> 'notes'), ''))
  returning id into v_id;

  for l in select * from jsonb_array_elements(v_priced -> 'lines') loop
    insert into invoice_lines (invoice_id, product_id, qty, unit_price_baisa, discount_baisa, vat_rate, vat_baisa, line_total_baisa)
    values (v_id, (l ->> 'product_id')::uuid, (l ->> 'qty')::numeric, (l ->> 'unit_price_baisa')::bigint,
            (l ->> 'discount')::bigint, (l ->> 'vat_rate')::numeric, (l ->> 'vat')::bigint,
            (l ->> 'gross')::bigint - (l ->> 'discount')::bigint + (l ->> 'vat')::bigint)
    returning id into v_line;
    for a in select * from jsonb_array_elements(
      stock_out((l ->> 'product_id')::uuid, (l ->> 'qty')::numeric, v_date, 'sale', 'invoice', v_id, null, true))
    loop
      insert into invoice_line_lots (invoice_line_id, lot_id, qty, unit_cost_baisa)
      values (v_line, (a ->> 'lot_id')::uuid, (a ->> 'qty')::numeric, (a ->> 'unit_cost')::numeric);
    end loop;
  end loop;
  return v_id;
end
$$;

-- «تم القبول»: the quotation becomes a numbered invoice dated today (or p_date).
create or replace function public.accept_quotation(p_id uuid, p_date date default current_date)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_q record;
  v_invoice uuid;
begin
  perform require_member();
  select * into v_q from quotations where id = p_id for update;
  if v_q.id is null then
    raise exception 'عرض السعر غير موجود | Quotation not found';
  end if;
  if v_q.status = 'accepted' then
    raise exception 'العرض مقبول مسبقاً | The quotation is already accepted';
  end if;
  if v_q.status = 'rejected' then
    raise exception 'العرض مرفوض | The quotation was rejected';
  end if;
  v_invoice := create_invoice(jsonb_build_object(
    'customer_id', v_q.customer_id, 'date', p_date, 'discount_baisa', v_q.discount_baisa,
    'notes', v_q.notes, 'quotation_id', v_q.id,
    'lines', (select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty,
                                                  'unit_price_baisa', unit_price_baisa, 'vat_rate', vat_rate)
                               order by created_at)
              from quotation_lines where quotation_id = p_id)));
  update quotations set status = 'accepted', invoice_id = v_invoice where id = p_id;
  return v_invoice;
end
$$;

-- An issued invoice is never edited: voiding returns every quantity to the lot it
-- came from and keeps the number visible as «ملغاة». Payments linked to it stay
-- with the customer as credit.
create or replace function public.void_invoice(p_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_inv record;
  r record;
begin
  perform require_member();
  select * into v_inv from sales_invoices where id = p_id for update;
  if v_inv.id is null then
    raise exception 'الفاتورة غير موجودة | Invoice not found';
  end if;
  if v_inv.status = 'void' then
    raise exception 'الفاتورة ملغاة مسبقاً | The invoice is already void';
  end if;
  for r in
    select ll.lot_id, ll.qty, ll.unit_cost_baisa, il.product_id
    from invoice_line_lots ll join invoice_lines il on il.id = ll.invoice_line_id
    where il.invoice_id = p_id
  loop
    update stock_lots set qty_remaining = qty_remaining + r.qty where id = r.lot_id;
    insert into stock_movements (item_id, lot_id, date, type, qty, unit_cost_baisa, ref_type, ref_id, notes)
    values (r.product_id, r.lot_id, current_date, 'sale_void', r.qty, r.unit_cost_baisa, 'invoice', p_id, nullif(trim(p_reason), ''));
  end loop;
  update sales_invoices set status = 'void', voided_at = now(), void_reason = nullif(trim(p_reason), '') where id = p_id;
  update customer_payments set invoice_id = null where invoice_id = p_id;
end
$$;

-- ── Grants ──────────────────────────────────────────────────────────

revoke execute on function
  public.sync_batch_qc(uuid), public.record_quality_check(jsonb), public.delete_quality_check(uuid),
  public.channel_by_name(text), public.customer_by_name(text), public.price_sales_lines(jsonb, bigint),
  public.save_quotation(jsonb), public.set_quotation_status(uuid, text),
  public.create_invoice(jsonb), public.accept_quotation(uuid, date), public.void_invoice(uuid, text)
from public, anon;
grant execute on function
  public.sync_batch_qc(uuid), public.record_quality_check(jsonb), public.delete_quality_check(uuid),
  public.channel_by_name(text), public.customer_by_name(text), public.price_sales_lines(jsonb, bigint),
  public.save_quotation(jsonb), public.set_quotation_status(uuid, text),
  public.create_invoice(jsonb), public.accept_quotation(uuid, date), public.void_invoice(uuid, text)
to authenticated;

-- ── Demo factory: adds quality checks, customers, prices and sales (same as 0009 otherwise) ──

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

  -- Round 2: the 250 g batch passed the lab, the 500 g batch is still waiting (and has no permit)
  perform record_quality_check(jsonb_build_object('batch_id', b250, 'check_date', d - 6, 'lab_name', 'مختبر الجودة (تجريبي)',
    'moisture_pct', 14.2, 'aflatoxin_ppb', 2.1, 'result', 'pass'));
  perform record_quality_check(jsonb_build_object('batch_id', b500, 'check_date', d - 1, 'lab_name', 'مختبر الجودة (تجريبي)',
    'result', 'pending', 'notes', 'العينة في المختبر'));

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
  -- Open quotation for the 500 g jar: it can be quoted, but not invoiced until released and permitted
  q2 := save_quotation(jsonb_build_object('customer_id', c3, 'date', d, 'status', 'sent',
    'lines', jsonb_build_array(jsonb_build_object('product_id', p500, 'qty', 20, 'unit_price_baisa', 3500))));
end
$$;
