create table if not exists orchestration_dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  orchestration_type text not null,
  reference_id text,
  failed_step text,
  error_message text,
  replay_status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists orchestration_recovery_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  orchestration_id uuid,
  recovery_action text,
  recovery_status text default 'success',
  created_at timestamptz default now()
);
