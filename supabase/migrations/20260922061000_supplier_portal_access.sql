create table if not exists public.supplier_portal_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_profile_id uuid not null references public.supplier_profiles(id) on delete cascade,
  supplier_party_id uuid not null references public.parties(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  expires_at timestamptz not null,
  created_by_auth_user_id uuid,
  accepted_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists supplier_portal_invitations_org_idx on public.supplier_portal_invitations(organization_id,status);
create index if not exists supplier_portal_invitations_email_idx on public.supplier_portal_invitations(lower(email));

create table if not exists public.supplier_portal_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_profile_id uuid not null references public.supplier_profiles(id) on delete cascade,
  supplier_party_id uuid not null references public.parties(id) on delete cascade,
  auth_user_id uuid not null,
  email text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED','SUSPENDED')),
  invitation_id uuid references public.supplier_portal_invitations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,supplier_profile_id,auth_user_id)
);
create index if not exists supplier_portal_access_user_idx on public.supplier_portal_access(auth_user_id,status);
create index if not exists supplier_portal_access_org_idx on public.supplier_portal_access(organization_id,supplier_profile_id,status);
alter table public.supplier_portal_invitations enable row level security;
alter table public.supplier_portal_access enable row level security;
