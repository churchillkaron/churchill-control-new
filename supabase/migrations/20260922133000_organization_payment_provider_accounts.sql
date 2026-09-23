create table if not exists public.organization_payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid references public.legal_entities(id) on delete set null,
  provider text not null,
  purpose text not null default 'merchant_payments',
  provider_account_id text not null,
  status text not null default 'PENDING',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_payment_provider_accounts_scope_uidx
    unique (organization_id, entity_id, provider, purpose),
  constraint organization_payment_provider_accounts_provider_uidx
    unique (provider, provider_account_id)
);

create index if not exists organization_payment_provider_accounts_org_idx
  on public.organization_payment_provider_accounts (organization_id, provider, purpose);

alter table public.organization_payment_provider_accounts enable row level security;
revoke all on public.organization_payment_provider_accounts from anon, authenticated;
grant all on public.organization_payment_provider_accounts to service_role;

comment on table public.organization_payment_provider_accounts is
  'Organization-scoped merchant payment provider connections. Avantiqo platform billing credentials are intentionally separate.';
