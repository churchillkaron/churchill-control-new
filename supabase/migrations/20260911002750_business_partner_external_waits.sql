create table if not exists public.business_partner_external_waits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null,
  party_id uuid not null,
  entity_id uuid null,
  period_id uuid null,
  conversation_id uuid null references public.intelligence_conversations(id) on delete cascade,
  wait_key text not null,
  run_id text not null,
  step_id text not null,
  objective text,
  event_source text not null,
  event_type text not null,
  correlation_key text not null,
  mission_checkpoint jsonb not null default '{}'::jsonb,
  status text not null default 'WAITING_EXTERNAL' check (status in ('WAITING_EXTERNAL','EVENT_RECEIVED','RESUMING','RESUMED','BLOCKED','CANCELLED')),
  event_id text,
  event_evidence jsonb not null default '{}'::jsonb,
  event_received_at timestamptz,
  claim_token text,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  continuation_result jsonb not null default '{}'::jsonb,
  resumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, wait_key)
);
create index if not exists idx_business_partner_external_wait_match on public.business_partner_external_waits (organization_id,status,event_source,event_type,correlation_key);
create index if not exists idx_business_partner_external_wait_run on public.business_partner_external_waits (organization_id,run_id,status,updated_at desc);
alter table public.business_partner_external_waits enable row level security;
revoke all on table public.business_partner_external_waits from public, anon, authenticated;
grant select, insert, update on table public.business_partner_external_waits to service_role;
