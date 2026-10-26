-- Quotation price options (owner's request, 26 Oct 2026): one quotation can show
-- the price for paying in advance, in instalments, after 60+ days, and for large
-- quantities. Each option is a % on the line prices:
--   price_options = [{key: 'advance'|'installments'|'deferred'|'bulk', pct, n?}]
-- (n = days for 'deferred', units for 'bulk'). On «تم القبول» the option the
-- customer chose sets the invoice prices (and the due date for advance / deferred).

alter table public.quotations
  add column if not exists price_options jsonb,
  add column if not exists chosen_option text;

-- p: as before (0010) plus price_options?
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
  v_options jsonb := case when jsonb_typeof(p -> 'price_options') = 'array' and jsonb_array_length(p -> 'price_options') > 0
                          then p -> 'price_options' end;
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
           notes = nullif(trim(p ->> 'notes'), ''), price_options = v_options
     where id = v_id;
    delete from quotation_lines where quotation_id = v_id;
  else
    insert into quotations (quote_no, customer_id, date, valid_until, status, subtotal_baisa, discount_baisa, vat_baisa, total_baisa, notes, price_options)
    values (next_doc_no('quote'), v_customer, v_date, v_valid, coalesce(nullif(p ->> 'status', ''), 'draft'),
            (v_priced ->> 'subtotal')::bigint, (v_priced ->> 'discount')::bigint, (v_priced ->> 'vat')::bigint,
            (v_priced ->> 'total')::bigint, nullif(trim(p ->> 'notes'), ''), v_options)
    returning id into v_id;
  end if;
  for l in select * from jsonb_array_elements(v_priced -> 'lines') loop
    insert into quotation_lines (quotation_id, product_id, qty, unit_price_baisa, vat_rate)
    values (v_id, (l ->> 'product_id')::uuid, (l ->> 'qty')::numeric, (l ->> 'unit_price_baisa')::bigint, (l ->> 'vat_rate')::numeric);
  end loop;
  return v_id;
end
$$;

-- The same unit-price rule as optionPrice() in src/domain/quoteOptions.ts
create or replace function public.option_price(p_price numeric, p_pct numeric)
returns bigint
language sql
immutable
set search_path = public
as $$ select round(p_price * (100 + coalesce(p_pct, 0)) / 100)::bigint $$;

drop function if exists public.accept_quotation(uuid, date);

-- «تم القبول»: the quotation becomes a numbered invoice dated p_date. With p_option,
-- the prices of that option are used, and the invoice notes say which one (p_note).
create or replace function public.accept_quotation(p_id uuid, p_date date default current_date,
                                                   p_option text default null, p_note text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_q record;
  v_opt jsonb;
  v_pct numeric := 0;
  v_due date;
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
  if nullif(p_option, '') is not null then
    select o into v_opt from jsonb_array_elements(coalesce(v_q.price_options, '[]')) o where o ->> 'key' = p_option;
    if v_opt is null then
      raise exception 'خيار السعر غير موجود في العرض | The price option is not on the quotation';
    end if;
    v_pct := coalesce((v_opt ->> 'pct')::numeric, 0);
    v_due := case p_option
               when 'advance' then p_date
               when 'deferred' then p_date + coalesce((v_opt ->> 'n')::int, 60)
             end;
  end if;
  v_invoice := create_invoice(jsonb_build_object(
    'customer_id', v_q.customer_id, 'date', p_date, 'due_date', v_due, 'discount_baisa', v_q.discount_baisa,
    'notes', nullif(concat_ws(E'\n', nullif(trim(p_note), ''), v_q.notes), ''), 'quotation_id', v_q.id,
    'lines', (select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty,
                                                  'unit_price_baisa', option_price(unit_price_baisa, v_pct),
                                                  'vat_rate', vat_rate)
                               order by created_at)
              from quotation_lines where quotation_id = p_id)));
  update quotations set status = 'accepted', invoice_id = v_invoice, chosen_option = nullif(p_option, '')
   where id = p_id;
  return v_invoice;
end
$$;

revoke execute on function public.save_quotation(jsonb), public.option_price(numeric, numeric),
  public.accept_quotation(uuid, date, text, text) from public, anon;
grant execute on function public.save_quotation(jsonb), public.option_price(numeric, numeric),
  public.accept_quotation(uuid, date, text, text) to authenticated;
