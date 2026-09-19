begin;

create table if not exists public.organization_product_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id text not null,
  status text not null default 'active' check (status in ('active','trial','suspended','cancelled')),
  source text not null default 'manual' check (source in ('manual','subscription','bundle','trial','legacy')),
  subscription_id uuid null references public.subscriptions(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product_id)
);

create index if not exists organization_product_entitlements_org_status_idx
  on public.organization_product_entitlements (organization_id, status, product_id);

alter table public.organization_product_entitlements enable row level security;

revoke all on table public.organization_product_entitlements from anon, authenticated;
grant select on table public.organization_product_entitlements to authenticated;

drop policy if exists organization_product_entitlements_member_read
  on public.organization_product_entitlements;

create policy organization_product_entitlements_member_read
  on public.organization_product_entitlements
  for select
  to authenticated
  using (public.same_organization(organization_id));

comment on table public.organization_product_entitlements is
  'Exact commercial Avantiqo product access per organization. Separate from broad organization_modules runtime access.';

commit;
