-- Zawrda v2 — starting reference data (kept when demo data is wiped).

insert into public.settings (id) values (1) on conflict (id) do nothing;

insert into public.doc_counters (kind) values ('invoice'), ('quote'), ('batch')
on conflict (kind) do nothing;

insert into public.channels (name, name_en, sort_order)
select v.name, v.name_en, v.sort_order
from (values
  ('إغاثة', 'Relief', 1),
  ('تجزئة', 'Retail', 2),
  ('صيدليات', 'Pharmacies', 3),
  ('تغذية رياضية', 'Sports nutrition', 4)
) as v (name, name_en, sort_order)
where not exists (select 1 from public.channels);

insert into public.expense_categories (name, name_en, color, is_default)
select v.name, v.name_en, v.color, true
from (values
  ('إيجار', 'Rent', '#2a78d6'),
  ('كهرباء', 'Electricity', '#eb6834'),
  ('ماء', 'Water', '#1baf7a'),
  ('رواتب', 'Salaries', '#8b5cf6'),
  ('نقل', 'Transport', '#d97706'),
  ('تغليف', 'Packaging', '#0891b2'),
  ('تسويق', 'Marketing', '#db2777'),
  ('صيانة', 'Maintenance', '#65a30d'),
  ('رسوم حكومية', 'Government fees', '#64748b'),
  ('أخرى', 'Other', '#78716c')
) as v (name, name_en, color)
where not exists (select 1 from public.expense_categories);
