create table if not exists public.operator_mission_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_execution_id text not null,
  mission_step_id text not null,
  capability_key text not null,
  payload_fingerprint text not null,
  dispatch_key text not null,
  state text not null default 'claimed' check (state in ('claimed','dispatched','verified','uncertain','failed')),
  prepared_at timestamptz not null default timezone('utc'::text, now()),
  dispatched_at timestamptz,
  verified_at timestamptz,
  failed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint operator_mission_dispatches_org_dispatch_key_key unique (organization_id, dispatch_key)
);

create index if not exists operator_mission_dispatches_execution_step_idx
  on public.operator_mission_dispatches (organization_id, mission_execution_id, mission_step_id);

alter table public.operator_mission_dispatches enable row level security;

revoke all on table public.operator_mission_dispatches from anon, authenticated;
grant select, insert, update on table public.operator_mission_dispatches to service_role;

comment on table public.operator_mission_dispatches is
  'Server-only at-most-once dispatch journal for Avantiqo Operator mission mutations. A claimed dispatch key is never automatically replayed; recovery proceeds through the registered verification read.';
