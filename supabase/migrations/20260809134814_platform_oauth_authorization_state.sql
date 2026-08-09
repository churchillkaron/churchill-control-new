create table if not exists public.platform_oauth_authorizations (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  provider text not null,
  purpose text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid null references public.parties(id) on delete set null,
  return_origin text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists platform_oauth_authorizations_org_idx
  on public.platform_oauth_authorizations (organization_id, provider, created_at desc);

create index if not exists platform_oauth_authorizations_expiry_idx
  on public.platform_oauth_authorizations (expires_at)
  where consumed_at is null;

alter table public.platform_oauth_authorizations enable row level security;

comment on table public.platform_oauth_authorizations is
  'Server-only one-time OAuth authorization state for organization-scoped cross-domain provider connections.';
