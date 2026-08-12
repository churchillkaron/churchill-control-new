create table if not exists public.organization_integration_setup_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id text not null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','IN_PROGRESS','COMPLETED','CANCELLED')),
  requested_by_party_id uuid null references public.parties(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, integration_id)
);

create index if not exists organization_integration_setup_requests_status_idx
  on public.organization_integration_setup_requests(status, updated_at desc);

alter table public.organization_integration_setup_requests enable row level security;

revoke all on public.organization_integration_setup_requests from anon, authenticated;
grant select, insert, update, delete on public.organization_integration_setup_requests to service_role;

comment on table public.organization_integration_setup_requests is
  'Internal Avantiqo setup queue for customer-requested business integrations. Customers interact through guarded server APIs only; provider and credential details stay internal.';
