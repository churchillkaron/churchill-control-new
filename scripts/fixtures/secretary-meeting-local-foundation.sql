begin;

-- Test-only foundation for the isolated Secretary meeting certification workdir.
-- This is intentionally NOT a production migration. It supplies only the canonical
-- foreign-key parents that predate the repository's retained migration history, so
-- the real Secretary migrations can be replayed from zero without pulling Finance,
-- Operations, or production data into this local certification.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parties (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text null,
  legal_name text null,
  email text null,
  phone text null,
  party_type text null,
  status text null,
  address text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table if not exists public.communication_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  conversation_id uuid null references public.communication_conversations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.secretary_outbound_call_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.parties enable row level security;
alter table public.communication_conversations enable row level security;
alter table public.communication_messages enable row level security;
alter table public.secretary_outbound_call_requests enable row level security;

grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.parties to service_role;
grant select, insert, update, delete on public.communication_conversations to service_role;
grant select, insert, update, delete on public.communication_messages to service_role;
grant select, insert, update, delete on public.secretary_outbound_call_requests to service_role;

commit;
