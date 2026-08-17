create table if not exists public.service_plan_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  service_plan_id uuid not null references public.service_plans(id) on delete restrict,
  occurrence_at timestamptz not null,
  original_scheduled_start timestamptz not null,
  work_order_id uuid,
  status text not null default 'pending' check (status in ('pending','generated','completed','cancelled','skipped','failed')),
  generation_key text not null,
  attributes jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service_plan_id, occurrence_at),
  unique (organization_id, generation_key)
);

create index if not exists service_plan_occurrences_org_time_idx
  on public.service_plan_occurrences (organization_id, occurrence_at, status);

create index if not exists service_plan_occurrences_plan_idx
  on public.service_plan_occurrences (organization_id, service_plan_id, occurrence_at desc);

create index if not exists service_plan_occurrences_work_order_idx
  on public.service_plan_occurrences (organization_id, work_order_id)
  where work_order_id is not null;

alter table public.service_plan_occurrences enable row level security;

revoke all on table public.service_plan_occurrences from anon, authenticated;
grant all on table public.service_plan_occurrences to service_role;

comment on table public.service_plan_occurrences is
  'Immutable recurrence occurrence identity and Service Management-to-Operations handoff ledger. Rescheduling the generated work order does not change occurrence_at.';
comment on column public.service_plan_occurrences.generation_key is
  'Deterministic idempotency key used when creating the canonical Operations work order.';
