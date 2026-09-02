begin;

alter table public.accounting_engagements
  add column if not exists entity_id uuid references public.legal_entities(id) on delete set null;

alter table public.accounting_engagement_runs
  add column if not exists entity_id uuid references public.legal_entities(id) on delete set null;

alter table public.accounting_engagement_work_items
  add column if not exists entity_id uuid references public.legal_entities(id) on delete set null,
  add column if not exists budget_minutes integer not null default 0 check (budget_minutes >= 0),
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz;

alter table public.accounting_client_requests
  add column if not exists entity_id uuid references public.legal_entities(id) on delete set null;

alter table public.accounting_work_program_template_steps
  add column if not exists budget_minutes integer not null default 0 check (budget_minutes >= 0);

create table if not exists public.accounting_practice_staff_capacity (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  staff_account_id uuid not null,
  display_name text,
  primary_role text not null default 'PREPARER' check (primary_role in ('PREPARER','REVIEWER','PARTNER','MANAGER','ADMIN')),
  skill_keys text[] not null default '{}',
  weekly_capacity_minutes integer not null default 2400 check (weekly_capacity_minutes >= 0 and weekly_capacity_minutes <= 10080),
  utilization_target numeric(5,4) not null default 0.8500 check (utilization_target > 0 and utilization_target <= 1),
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (accounting_firm_id, staff_account_id, effective_from)
);

create index if not exists accounting_practice_staff_capacity_lookup_idx
  on public.accounting_practice_staff_capacity (accounting_firm_id, status, effective_from, effective_to, staff_account_id);
create index if not exists accounting_engagement_runs_entity_idx
  on public.accounting_engagement_runs (accounting_firm_id, organization_id, entity_id, status, due_at);
create index if not exists accounting_work_items_capacity_idx
  on public.accounting_engagement_work_items (accounting_firm_id, assigned_to, status, due_at)
  where status not in ('COMPLETE','SKIPPED');

alter table public.accounting_practice_staff_capacity enable row level security;
revoke all on table public.accounting_practice_staff_capacity from anon, authenticated;
grant select, insert, update, delete on table public.accounting_practice_staff_capacity to service_role;

with entity_counts as (
  select organization_id, min(id::text)::uuid as entity_id, count(*) as entity_count
  from public.legal_entities
  group by organization_id
)
update public.accounting_engagements engagement
set entity_id = entity_counts.entity_id,
    updated_at = now()
from entity_counts
where engagement.organization_id = entity_counts.organization_id
  and engagement.entity_id is null
  and entity_counts.entity_count = 1;

update public.accounting_engagement_runs run
set entity_id = coalesce(run.entity_id, engagement.entity_id, nullif(run.metadata->>'entity_id','')::uuid),
    updated_at = now()
from public.accounting_engagements engagement
where engagement.id = run.engagement_id
  and run.entity_id is null;

update public.accounting_engagement_work_items item
set entity_id = run.entity_id,
    updated_at = now()
from public.accounting_engagement_runs run
where run.id = item.run_id
  and item.entity_id is null
  and run.entity_id is not null;

update public.accounting_client_requests request
set entity_id = run.entity_id,
    updated_at = now()
from public.accounting_engagement_runs run
where run.id = request.run_id
  and request.entity_id is null
  and run.entity_id is not null;

update public.accounting_work_program_template_steps step
set budget_minutes = case step.step_key
  when 'client_evidence' then 30
  when 'source_completeness' then 45
  when 'reconcile_subledgers' then 120
  when 'period_adjustments' then 90
  when 'tax_and_statutory' then 90
  when 'management_accounts' then 120
  when 'reviewer_review' then 75
  when 'clear_review_points' then 60
  when 'partner_clearance' then 30
  when 'client_delivery' then 30
  when 'acceptance_continuance' then 45
  when 'pbc_evidence' then 60
  when 'year_end_reconciliations' then 240
  when 'year_end_adjustments' then 180
  when 'tax_statutory_final' then 180
  when 'financial_statements' then 240
  when 'reviewer_final' then 150
  when 'partner_final' then 75
  when 'finalize_lock' then 30
  when 'roll_forward' then 15
  else step.budget_minutes
end,
    updated_at = now()
from public.accounting_work_program_templates template
where template.id = step.template_id
  and template.is_system = true
  and template.template_key in ('monthly_accounting_baseline','year_end_close_baseline');

commit;
