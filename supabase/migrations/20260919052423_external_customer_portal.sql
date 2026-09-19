begin;

create table if not exists public.customer_portal_access_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null,
  token_hash text not null,
  purpose text not null default 'PORTAL_ACCESS',
  source_type text null,
  source_id text null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint customer_portal_access_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  unique (token_hash)
);

create table if not exists public.customer_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null,
  session_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint customer_portal_session_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  unique (session_token_hash)
);

create table if not exists public.customer_portal_payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  party_id uuid not null,
  source_type text not null,
  source_id text not null,
  description text not null,
  amount numeric(18,2) not null check (amount > 0),
  currency_code text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','CHECKOUT_CREATED','PAID','FAILED','CANCELLED','REFUNDED')),
  provider text not null default 'STRIPE',
  bank_account_id uuid null references public.bank_accounts(id) on delete restrict,
  provider_session_id text null,
  provider_payment_id text null,
  provider_event_id text null,
  settled_at timestamptz null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_portal_payment_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  unique (organization_id, idempotency_key),
  unique (organization_id, source_type, source_id)
);

create index if not exists customer_portal_access_party_idx
  on public.customer_portal_access_links (organization_id, party_id, expires_at desc);
create index if not exists customer_portal_sessions_party_idx
  on public.customer_portal_sessions (organization_id, party_id, expires_at desc);
create index if not exists customer_portal_payment_party_idx
  on public.customer_portal_payment_requests (organization_id, party_id, status, created_at desc);

alter table public.customer_portal_access_links enable row level security;
alter table public.customer_portal_sessions enable row level security;
alter table public.customer_portal_payment_requests enable row level security;

revoke all on public.customer_portal_access_links from anon, authenticated;
revoke all on public.customer_portal_sessions from anon, authenticated;
revoke all on public.customer_portal_payment_requests from anon, authenticated;

grant select, insert, update, delete on public.customer_portal_access_links to service_role;
grant select, insert, update, delete on public.customer_portal_sessions to service_role;
grant select, insert, update, delete on public.customer_portal_payment_requests to service_role;

comment on table public.customer_portal_access_links is
  'Server-only one-time access links for external customer portal sessions. Raw tokens are never persisted.';
comment on table public.customer_portal_sessions is
  'Server-only customer portal sessions scoped to one organization and canonical Party.';
comment on table public.customer_portal_payment_requests is
  'Customer-visible payable obligations for authoritative Avantiqo business documents. Payment state changes only from verified provider settlement.';

commit;
