alter table public.organization_leads
  add column if not exists selected_products jsonb not null default '[]'::jsonb,
  add column if not exists requesting_organization_id uuid null references public.organizations(id) on delete set null,
  add column if not exists request_type text null,
  add column if not exists request_note text null;

comment on column public.organization_leads.selected_products is
  'Exact Avantiqo commercial products requested by the prospect or existing customer.';
comment on column public.organization_leads.requesting_organization_id is
  'Existing customer organization that originated an upgrade/product request, when applicable.';
comment on column public.organization_leads.request_type is
  'Commercial request origin such as upgrade or new_business.';
comment on column public.organization_leads.request_note is
  'Customer-provided commercial context for the product request.';
