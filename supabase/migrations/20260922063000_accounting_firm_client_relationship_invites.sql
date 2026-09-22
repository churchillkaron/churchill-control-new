create unique index if not exists organization_clients_firm_client_unique on public.organization_clients(firm_organization_id,client_organization_id);
create table if not exists public.organization_client_invitations (
  id uuid primary key default gen_random_uuid(),
  firm_organization_id uuid not null references public.organizations(id) on delete cascade,
  client_email text not null,
  billing_model text not null default 'firm_pays',
  token_hash text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  expires_at timestamptz not null,
  created_by_auth_user_id uuid,
  accepted_by_auth_user_id uuid,
  accepted_client_organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists organization_client_invitations_firm_idx on public.organization_client_invitations(firm_organization_id,status);
create index if not exists organization_client_invitations_email_idx on public.organization_client_invitations(lower(client_email),status);
alter table public.organization_client_invitations enable row level security;
