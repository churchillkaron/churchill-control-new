begin;

create table if not exists public.secretary_telephony_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_line_id uuid null references public.secretary_phone_lines(id) on delete set null,
  mode text not null default 'AVANTIQO_MANAGED'
    check (mode in ('AVANTIQO_MANAGED','CUSTOM_SIP')),
  provider_id text not null,
  provider_connection_id text null,
  provider_phone_number_id text null,
  provider_number_order_id text null,
  provider_sub_number_order_id text null,
  requirement_group_id text null,
  country_code text not null check (country_code = upper(country_code) and length(country_code) = 2),
  number_type text not null default 'local',
  requested_locality text null,
  requested_number text null,
  phone_number text null,
  status text not null default 'REQUESTED'
    check (status in (
      'REQUESTED',
      'SEARCHED',
      'ORDERING',
      'REQUIREMENTS_PENDING',
      'PROVISIONING',
      'ACTIVE',
      'FAILED',
      'SUSPENDED',
      'RELEASING',
      'RELEASED'
    )),
  idempotency_key text not null,
  capabilities jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  regulatory_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_error text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create unique index if not exists secretary_telephony_provider_number_uidx
  on public.secretary_telephony_connections (provider_id, provider_phone_number_id)
  where provider_phone_number_id is not null;

create unique index if not exists secretary_telephony_active_number_uidx
  on public.secretary_telephony_connections (provider_id, phone_number)
  where phone_number is not null and active = true and status <> 'RELEASED';

create index if not exists secretary_telephony_org_status_idx
  on public.secretary_telephony_connections (organization_id, status, created_at desc);

create index if not exists secretary_telephony_phone_line_idx
  on public.secretary_telephony_connections (organization_id, phone_line_id)
  where phone_line_id is not null;

alter table public.secretary_telephony_connections enable row level security;

revoke all on public.secretary_telephony_connections from anon, authenticated;
grant select, insert, update, delete on public.secretary_telephony_connections to service_role;

comment on table public.secretary_telephony_connections is
  'Organization-scoped Avantiqo Secretary telephony provisioning state. Carrier/provider resources are transport-only; customer contacts, policy, intelligence, calendar, memory, call state and orchestration remain Avantiqo-owned. No carrier secret is stored in this table.';

comment on column public.secretary_telephony_connections.mode is
  'AVANTIQO_MANAGED is the default customer experience. CUSTOM_SIP is an optional advanced transport path only.';

comment on column public.secretary_telephony_connections.idempotency_key is
  'Client-generated provisioning replay key scoped to one organization so number purchasing cannot be duplicated by retries.';

commit;
