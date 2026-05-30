create table if not exists accounting_event_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  parent_event_type text not null,
  child_event_type text not null,
  execution_order integer default 1,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists accounting_event_replays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  original_event_id uuid not null,
  replay_reason text,
  replay_status text default 'queued',
  created_at timestamptz default now()
);
