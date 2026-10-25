-- Supabase blocks UPDATE/DELETE without a WHERE clause on API calls (pg-safeupdate),
-- which made «مسح كل البيانات» fail. Same function, with an explicit WHERE.
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
  update doc_counters set next_no = 1 where true;
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
