begin;

alter table public.subscriptions
  add column if not exists selected_products jsonb;

comment on column public.subscriptions.selected_products is
  'Exact commercial Avantiqo product selections. selected_modules remains a legacy compatibility field.';

commit;
