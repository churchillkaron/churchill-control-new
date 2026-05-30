create table if not exists accounting_event_bus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  event_payload jsonb,
  processing_status text default 'pending',
  processed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists accounting_event_failures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid,
  event_type text,
  failure_reason text,
  retry_status text default 'failed',
  retried_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists accounting_event_processing_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid,
  event_type text,
  processing_result text,
  created_at timestamptz default now()
);
