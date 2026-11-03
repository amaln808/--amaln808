-- When an order gets its invoice (its quotation accepted, or a quotation linked),
-- the receipts already recorded for its payment stages move onto that invoice, so
-- the invoice shows them as paid and they settle nothing else (owner's request,
-- 3 Nov 2026: an order's remaining amount must show in the receivables).
create or replace function public.attach_order_payments()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_id is not null and old.invoice_id is distinct from new.invoice_id then
    update customer_payments set invoice_id = new.invoice_id
     where invoice_id is null
       and id in (select payment_id from order_steps where order_id = new.id and payment_id is not null);
  end if;
  return new;
end
$$;
create trigger attach_order_payments after update of invoice_id on public.orders
for each row execute function public.attach_order_payments();
revoke execute on function public.attach_order_payments() from public, anon;
