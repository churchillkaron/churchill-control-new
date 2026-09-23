alter table public.supplier_portal_accounts
  add column if not exists logo_url text;

alter table public.supplier_storefront_products
  add column if not exists image_url text;

comment on column public.supplier_portal_accounts.logo_url is
  'Supplier-controlled logo image URL for Supplier Network and public storefront presentation.';
comment on column public.supplier_storefront_products.image_url is
  'Supplier-controlled product image URL for Supplier Network and public storefront presentation.';