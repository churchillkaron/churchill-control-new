create extension if not exists pgcrypto;

create table if not exists public.operations_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid null,
  period_id uuid null,
  capability_id text not null,
  record_type text null,
  code text null,
  name text null,
  description text null,
  status text not null default 'draft',
  priority text null,
  assigned_to uuid null,
  scheduled_start timestamptz null,
  scheduled_end timestamptz null,
  due_at timestamptz null,
  completed_at timestamptz null,
  last_command text null,
  source_domain text null,
  source_type text null,
  source_id text null,
  attributes jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_records_scope_idx
  on public.operations_records (organization_id, entity_id, capability_id);
create index if not exists operations_records_status_idx
  on public.operations_records (organization_id, capability_id, status);
create index if not exists operations_records_source_idx
  on public.operations_records (organization_id, source_domain, source_type, source_id);
create index if not exists operations_records_due_idx
  on public.operations_records (organization_id, due_at)
  where due_at is not null;

create table if not exists public.operations_command_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid null,
  period_id uuid null,
  capability_id text not null,
  command text not null,
  command_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb null,
  error jsonb null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  failed_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists operations_command_ledger_key_uidx
  on public.operations_command_ledger (organization_id, coalesce(entity_id::text, ''), command_key);
create index if not exists operations_command_ledger_status_idx
  on public.operations_command_ledger (status, started_at);

create table if not exists public.operations_event_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid null,
  period_id uuid null,
  domain text not null default 'operations',
  event_type text not null,
  aggregate_type text null,
  aggregate_id text null,
  payload jsonb not null,
  status text not null default 'pending',
  occurred_at timestamptz not null default now(),
  published_at timestamptz null,
  attempts integer not null default 0,
  last_error jsonb null,
  next_attempt_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists operations_event_outbox_pending_idx
  on public.operations_event_outbox (status, next_attempt_at, occurred_at)
  where status in ('pending', 'retry');
create index if not exists operations_event_outbox_scope_idx
  on public.operations_event_outbox (organization_id, entity_id, event_type);

comment on table public.operations_records is
  'Industry-neutral Operations records shared by canonical Operations capabilities.';
comment on table public.operations_command_ledger is
  'Durable idempotency and execution ledger for Operations commands.';
comment on table public.operations_event_outbox is
  'Transactional outbox for reliable publication of Operations domain events.';
