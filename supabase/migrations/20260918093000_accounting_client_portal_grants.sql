begin;

create table if not exists public.accounting_client_portal_grants (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete set null,
  engagement_id uuid not null references public.accounting_engagements(id) on delete cascade,
  token_hash text not null unique,
  client_name text,
  client_email text,
  issued_by uuid references public.staff_accounts(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.staff_accounts(id) on delete set null,
  revocation_reason text,
  last_viewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > issued_at)
);

create index if not exists accounting_client_portal_grants_engagement_idx
  on public.accounting_client_portal_grants (accounting_firm_id, engagement_id, expires_at desc);
create index if not exists accounting_client_portal_grants_client_idx
  on public.accounting_client_portal_grants (accounting_firm_id, organization_id, expires_at desc);

alter table public.accounting_client_portal_grants enable row level security;
revoke all on table public.accounting_client_portal_grants from anon, authenticated;
grant select, insert, update, delete on table public.accounting_client_portal_grants to service_role;

comment on table public.accounting_client_portal_grants is
  'Revocable, expiring accounting-client portal grants scoped to one governed engagement. A portal grant never grants general organization or ERP access.';

commit;
