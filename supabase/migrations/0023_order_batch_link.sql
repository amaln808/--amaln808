-- An order's production stage can point at the production batch that made it
-- (owner's request, 4 Nov 2026), so the order shows its batch and the purchase
-- plan stops counting orders already produced.
alter table public.order_steps
  add column if not exists batch_id uuid references public.production_batches (id) on delete set null deferrable initially immediate;
