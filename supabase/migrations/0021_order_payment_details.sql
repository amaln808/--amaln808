-- Order payments show when and how they were paid (owner's request, 3 Nov 2026).
-- A payment stage keeps the method, and the receipt it was recorded as in the
-- customer's account (customer_payments.id). No foreign key: a receipt saved
-- offline reaches the server after the stage does.
alter table public.order_steps
  add column if not exists method text check (method is null or method in ('cash', 'bank', 'card', 'other')),
  add column if not exists payment_id uuid;
