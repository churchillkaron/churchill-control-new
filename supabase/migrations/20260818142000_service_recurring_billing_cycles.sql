create table if not exists public.service_plan_billing_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  service_plan_id uuid not null references public.service_plans(id) on delete restrict,
  cycle_at timestamptz not null,
  generation_key text not null,
  status text not null default 'pending' check (status in ('pending','invoiced','failed','skipped')),
  invoice_id uuid,
  invoice_number text,
  invoiced_at timestamptz,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service_plan_id, cycle_at),
  unique (organization_id, generation_key)
);

create index if not exists service_plan_billing_cycles_org_due_idx
  on public.service_plan_billing_cycles (organization_id, status, cycle_at);

create index if not exists service_plan_billing_cycles_plan_idx
  on public.service_plan_billing_cycles (organization_id, service_plan_id, cycle_at desc);

create index if not exists service_plan_billing_cycles_invoice_idx
  on public.service_plan_billing_cycles (organization_id, invoice_id)
  where invoice_id is not null;

alter table public.service_plan_billing_cycles enable row level security;

revoke all on table public.service_plan_billing_cycles from anon, authenticated;
grant all on table public.service_plan_billing_cycles to service_role;

comment on table public.service_plan_billing_cycles is
  'Service Management-owned recurring billing cycle identities. Finance owns the resulting customer invoice and accounting records.';
comment on column public.service_plan_billing_cycles.cycle_at is
  'Immutable recurring billing occurrence identity, independent from field-service visit scheduling.';
comment on column public.service_plan_billing_cycles.generation_key is
  'Deterministic Service Management billing idempotency key used when handing the cycle to Finance.';
