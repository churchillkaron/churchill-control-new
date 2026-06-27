create table if not exists finance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  module_name text not null,
  entity_type text not null,
  entity_id text not null,
  action_type text not null,
  previous_data jsonb,
  new_data jsonb,
  changed_by text,
  created_at timestamptz default now()
);

create table if not exists finance_entity_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  history_snapshot jsonb,
  snapshot_type text default 'version',
  created_at timestamptz default now()
);

create table if not exists finance_anomaly_detection (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  anomaly_type text not null,
  severity text default 'medium',
  reference_type text,
  reference_id text,
  anomaly_score numeric(14,2) default 0,
  anomaly_message text,
  created_at timestamptz default now()
);
