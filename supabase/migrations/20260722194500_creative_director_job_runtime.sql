create table if not exists public.creative_director_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  creative_mission_id uuid not null references public.creative_missions(id) on delete cascade,
  creative_project_id uuid not null references public.creative_projects(id) on delete cascade,
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  current_step_key text,
  current_step_index integer not null default 0,
  total_steps integer not null default 0,
  completed_steps integer not null default 0,
  progress_percent numeric(5,2) not null default 0,
  input_snapshot jsonb not null default '{}'::jsonb,
  asset_snapshot jsonb not null default '[]'::jsonb,
  current_plan jsonb,
  storyboard_audit jsonb,
  pipeline_result jsonb,
  error jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creative_director_jobs_scope_idx
  on public.creative_director_jobs (
    organization_id,
    creative_project_id,
    created_at desc
  );

create index if not exists creative_director_jobs_runnable_idx
  on public.creative_director_jobs (
    status,
    lease_expires_at,
    created_at
  );

create table if not exists public.creative_director_job_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null references public.creative_director_jobs(id) on delete cascade,
  step_key text not null,
  step_index integer not null,
  department text not null,
  status text not null default 'WAITING'
    check (status in ('WAITING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED', 'CANCELLED')),
  attempt integer not null default 0,
  provider text,
  model text,
  confidence numeric,
  duration_ms bigint,
  metrics jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, step_key),
  unique (job_id, step_index)
);

create index if not exists creative_director_job_steps_job_idx
  on public.creative_director_job_steps (
    job_id,
    step_index
  );

create index if not exists creative_director_job_steps_status_idx
  on public.creative_director_job_steps (
    organization_id,
    status,
    updated_at
  );

alter table public.creative_director_jobs enable row level security;
alter table public.creative_director_job_steps enable row level security;

comment on table public.creative_director_jobs is
  'Durable resumable planning jobs for the Avantiqo dynamic creative director council.';

comment on table public.creative_director_job_steps is
  'Persisted per-director planning steps with timing, provider, confidence, error and retry state.';
