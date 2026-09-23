alter table public.supplier_portal_accounts
  add column if not exists supplier_categories text[] not null default '{}'::text[],
  add column if not exists service_areas text[] not null default '{}'::text[];

create index if not exists supplier_portal_accounts_categories_gin
  on public.supplier_portal_accounts using gin(supplier_categories);
create index if not exists supplier_portal_accounts_service_areas_gin
  on public.supplier_portal_accounts using gin(service_areas);

comment on column public.supplier_portal_accounts.supplier_categories is
  'Self-described Supplier Network discovery categories for this supplier profile.';
comment on column public.supplier_portal_accounts.service_areas is
  'Self-described cities, regions or delivery/service areas for Supplier Network discovery.';