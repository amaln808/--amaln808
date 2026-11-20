-- Document links (note of 20 November 2026): instead of uploading a file, a
-- record can keep the link to its PDF in Google Drive (or anywhere else).
-- Optional; existing rows keep NULL and nothing else changes. Only https links.

do $$
declare
  t text;
begin
  foreach t in array array[
    'sales_invoices', 'purchases', 'customer_payments', 'supplier_payments',
    'expenses', 'customers', 'suppliers', 'agreements'
  ] loop
    execute format('alter table public.%I add column if not exists document_url text', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_document_url_check');
    execute format(
      $f$alter table public.%I add constraint %I check (document_url is null or document_url ~* '^https://[^[:space:]]+$')$f$,
      t, t || '_document_url_check'
    );
  end loop;
end
$$;

-- Expenses are saved through save_expense: keep the link too
create or replace function public.save_expense(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid());
  v_supplier uuid := coalesce(nullif(p ->> 'supplier_id', '')::uuid, supplier_by_name(p ->> 'supplier_name'));
  v_category uuid := coalesce(nullif(p ->> 'category_id', '')::uuid, expense_category_by_name(p ->> 'category_name'));
  v_amount bigint := (p ->> 'amount_baisa')::bigint;
  v_vat bigint := coalesce(nullif(p ->> 'vat_baisa', '')::bigint, 0);
begin
  perform require_member();
  if v_amount is null or v_amount <= 0 then
    raise exception 'المبلغ غير صحيح | Invalid amount';
  end if;
  if v_vat < 0 or v_vat > v_amount then
    raise exception 'الضريبة أكبر من المبلغ | VAT is larger than the amount';
  end if;
  insert into expenses (id, date, category_id, supplier_id, amount_baisa, vat_baisa, method, receipt_path, ocr_text, notes, document_url)
  values (v_id, coalesce(nullif(p ->> 'date', '')::date, current_date), v_category, v_supplier, v_amount, v_vat,
          coalesce(nullif(p ->> 'method', ''), 'cash'), nullif(p ->> 'receipt_path', ''), nullif(p ->> 'ocr_text', ''),
          nullif(trim(p ->> 'notes'), ''), nullif(trim(p ->> 'document_url'), ''))
  on conflict (id) do update set
    date = excluded.date, category_id = excluded.category_id, supplier_id = excluded.supplier_id,
    amount_baisa = excluded.amount_baisa, vat_baisa = excluded.vat_baisa, method = excluded.method,
    receipt_path = coalesce(excluded.receipt_path, expenses.receipt_path),
    ocr_text = coalesce(excluded.ocr_text, expenses.ocr_text), notes = excluded.notes,
    document_url = excluded.document_url;
  if v_supplier is not null then
    update suppliers set last_expense_category_id = v_category where id = v_supplier;
  end if;
  return v_id;
end
$$;
