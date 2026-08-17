create table if not exists public.service_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  customer_party_id uuid not null,
  customer_location_id uuid,
  customer_location_name text,
  location_timezone text,
  service_name text not null,
  service_category text,
  industry_key text not null default 'generic-service',
  execution_template_id text,
  recurrence jsonb not null default '{"preset":"monthly","interval":1,"unit":"month","weekday":null,"day_of_month":null}'::jsonb,
  first_service_at timestamptz not null,
  next_service_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  contract_start timestamptz not null,
  contract_end timestamptz,
  preferred_window jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('draft','active','paused','cancelled','completed','archived')),
  last_generated_occurrence_at timestamptz,
  last_work_order_id uuid,
  last_completed_at timestamptz,
  attributes jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_plans_contract_window_check check (contract_end is null or contract_end >= contract_start)
);

create index if not exists service_plans_org_status_next_idx
  on public.service_plans (organization_id, status, next_service_at);

create index if not exists service_plans_org_customer_idx
  on public.service_plans (organization_id, customer_party_id);

create index if not exists service_plans_org_industry_idx
  on public.service_plans (organization_id, industry_key, service_category);

alter table public.service_plans enable row level security;

revoke all on table public.service_plans from anon, authenticated;
grant all on table public.service_plans to service_role;

comment on table public.service_plans is
  'Service Management-owned recurring customer service commitments. Executable occurrences are handed to canonical Operations work orders.';
comment on column public.service_plans.recurrence is
  'Industry-neutral recurrence contract. Individual Operations work-order rescheduling must not mutate this series.';
comment on column public.service_plans.execution_template_id is
  'Reference to a dynamic industry execution protocol/template; not interpreted by the scheduling core.';
