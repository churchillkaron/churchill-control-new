-- Converge procurement supplier identity on canonical parties.id.
-- Legacy public.vendors is no longer the supplier identity authority.

alter table public.supplier_profiles
  drop constraint if exists supplier_profiles_party_org_fk;
alter table public.supplier_profiles
  add constraint supplier_profiles_party_org_fk
  foreign key (organization_id, party_id)
  references public.parties (organization_id, id);

create unique index if not exists ux_supplier_profiles_org_party
  on public.supplier_profiles (organization_id, party_id)
  where organization_id is not null and party_id is not null;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_vendor_id_fkey;
alter table public.purchase_orders
  drop constraint if exists purchase_orders_supplier_party_org_fk;
alter table public.purchase_orders
  add constraint purchase_orders_supplier_party_org_fk
  foreign key (organization_id, supplier_party_id)
  references public.parties (organization_id, id);

alter table public.goods_receipts
  drop constraint if exists goods_receipts_vendor_id_fkey;
alter table public.goods_receipts
  drop constraint if exists goods_receipts_supplier_party_org_fk;alter table public.goods_receipts
  add constraint goods_receipts_supplier_party_org_fk
  foreign key (organization_id, supplier_party_id)
  references public.parties (organization_id, id);

alter table public.supplier_prices
  drop constraint if exists supplier_prices_vendor_id_fkey;
alter table public.supplier_prices
  drop constraint if exists supplier_prices_supplier_party_org_fk;
alter table public.supplier_prices
  add constraint supplier_prices_supplier_party_org_fk
  foreign key (organization_id, supplier_party_id)
  references public.parties (organization_id, id);

alter table public.vendor_invoices
  drop constraint if exists vendor_invoices_vendor_party_org_fk;
alter table public.vendor_invoices
  add constraint vendor_invoices_vendor_party_org_fk
  foreign key (organization_id, vendor_party_id)
  references public.parties (organization_id, id);

comment on column public.purchase_orders.supplier_party_id is
  'Canonical supplier Party id; legacy vendors.id is retired for procurement identity.';
comment on column public.goods_receipts.supplier_party_id is
  'Canonical supplier Party id.';
comment on column public.supplier_prices.supplier_party_id is
  'Canonical supplier Party id.';