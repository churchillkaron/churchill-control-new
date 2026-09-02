begin;

alter table public.projects
  add column if not exists owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  add column if not exists priority text not null default 'NORMAL',
  add column if not exists portfolio_group text,
  add column if not exists baseline_start_date date,
  add column if not exists baseline_end_date date;

alter table public.projects drop constraint if exists projects_priority_check;
alter table public.projects add constraint projects_priority_check
  check (priority in ('LOW','NORMAL','HIGH','CRITICAL'));

create index if not exists projects_org_entity_status_dates_idx
  on public.projects (organization_id, entity_id, status, end_date, start_date);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  project_id uuid not null references public.projects(id) on delete cascade,
  code text,
  name text not null,
  description text,
  status text not null default 'PLANNED',
  target_date date,
  baseline_date date,
  completed_at timestamptz,
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  weight numeric(7,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_milestones_status_check check (status in ('PLANNED','ACTIVE','AT_RISK','COMPLETE','CANCELLED')),
  constraint project_milestones_weight_check check (weight >= 0 and weight <= 100)
);

create index if not exists project_milestones_project_target_idx
  on public.project_milestones (organization_id, entity_id, project_id, status, target_date);

create table if not exists public.project_work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.project_milestones(id) on delete set null,
  parent_work_item_id uuid references public.project_work_items(id) on delete set null,
  work_type text not null default 'TASK',
  code text,
  name text not null,
  description text,
  status text not null default 'PLANNED',
  priority text not null default 'NORMAL',
  planned_start date,
  planned_finish date,
  baseline_start date,
  baseline_finish date,
  actual_start timestamptz,
  actual_finish timestamptz,
  progress_percent numeric(7,4) not null default 0,
  estimate_hours numeric(14,4),
  assignee_staff_id uuid references public.staff_accounts(id) on delete set null,
  team_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_work_items_type_check check (work_type in ('PHASE','DELIVERABLE','TASK','WORK_PACKAGE')),
  constraint project_work_items_status_check check (status in ('PLANNED','READY','IN_PROGRESS','BLOCKED','COMPLETE','CANCELLED')),
  constraint project_work_items_priority_check check (priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  constraint project_work_items_progress_check check (progress_percent >= 0 and progress_percent <= 100),
  constraint project_work_items_dates_check check (planned_finish is null or planned_start is null or planned_finish >= planned_start)
);

create index if not exists project_work_items_project_status_idx
  on public.project_work_items (organization_id, entity_id, project_id, status, planned_finish);
create index if not exists project_work_items_assignee_idx
  on public.project_work_items (organization_id, assignee_staff_id, status, planned_finish);

create table if not exists public.project_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  project_id uuid not null references public.projects(id) on delete cascade,
  predecessor_work_item_id uuid not null references public.project_work_items(id) on delete cascade,
  successor_work_item_id uuid not null references public.project_work_items(id) on delete cascade,
  dependency_type text not null default 'FINISH_TO_START',
  lag_days integer not null default 0,
  created_at timestamptz not null default now(),
  constraint project_dependencies_distinct_check check (predecessor_work_item_id <> successor_work_item_id),
  constraint project_dependencies_type_check check (dependency_type in ('FINISH_TO_START','START_TO_START','FINISH_TO_FINISH','START_TO_FINISH')),
  constraint project_dependencies_unique unique (project_id, predecessor_work_item_id, successor_work_item_id)
);

create index if not exists project_dependencies_project_idx
  on public.project_dependencies (organization_id, entity_id, project_id);

create table if not exists public.project_risks_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  project_id uuid not null references public.projects(id) on delete cascade,
  work_item_id uuid references public.project_work_items(id) on delete set null,
  record_type text not null default 'RISK',
  title text not null,
  description text,
  category text,
  status text not null default 'OPEN',
  probability_score integer,
  impact_score integer,
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  target_resolution_date date,
  response_plan text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_risks_issues_type_check check (record_type in ('RISK','ISSUE')),
  constraint project_risks_issues_status_check check (status in ('OPEN','MONITOR','MITIGATING','ESCALATED','RESOLVED','CLOSED')),
  constraint project_risks_probability_check check (probability_score is null or probability_score between 1 and 5),
  constraint project_risks_impact_check check (impact_score is null or impact_score between 1 and 5)
);

create index if not exists project_risks_issues_project_status_idx
  on public.project_risks_issues (organization_id, entity_id, project_id, record_type, status, target_resolution_date);

create table if not exists public.project_resource_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  project_id uuid not null references public.projects(id) on delete cascade,
  work_item_id uuid references public.project_work_items(id) on delete cascade,
  staff_account_id uuid not null references public.staff_accounts(id) on delete restrict,
  allocation_start date not null,
  allocation_end date not null,
  allocation_percent numeric(7,4) not null default 100,
  planned_hours numeric(14,4),
  role_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_resource_allocations_dates_check check (allocation_end >= allocation_start),
  constraint project_resource_allocations_percent_check check (allocation_percent > 0 and allocation_percent <= 100)
);

create index if not exists project_resource_allocations_capacity_idx
  on public.project_resource_allocations (organization_id, staff_account_id, allocation_start, allocation_end);
create index if not exists project_resource_allocations_project_idx
  on public.project_resource_allocations (organization_id, entity_id, project_id, allocation_start, allocation_end);

create table if not exists public.project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  project_id uuid not null references public.projects(id) on delete cascade,
  line_code text,
  description text not null,
  currency_code text not null,
  planned_amount numeric(18,4) not null default 0,
  forecast_amount numeric(18,4),
  finance_account_id uuid,
  cost_center_id uuid,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_budget_lines_amount_check check (planned_amount >= 0 and (forecast_amount is null or forecast_amount >= 0)),
  constraint project_budget_lines_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create index if not exists project_budget_lines_project_idx
  on public.project_budget_lines (organization_id, entity_id, project_id, currency_code);

create table if not exists public.project_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  project_id uuid not null references public.projects(id) on delete cascade,
  change_number text,
  title text not null,
  description text,
  status text not null default 'DRAFT',
  requested_by_staff_id uuid references public.staff_accounts(id) on delete set null,
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  cost_delta numeric(18,4),
  schedule_delta_days integer,
  currency_code text,
  decision_notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_change_requests_status_check check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','IMPLEMENTED','CANCELLED'))
);

create index if not exists project_change_requests_project_status_idx
  on public.project_change_requests (organization_id, entity_id, project_id, status, created_at);

create or replace function public.validate_project_control_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_project_org uuid;
  v_project_entity uuid;
begin
  select organization_id, entity_id into v_project_org, v_project_entity
  from public.projects where id = new.project_id;
  if not found or v_project_org is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Project control record must belong to the project organization';
  end if;
  if new.entity_id is null then new.entity_id := v_project_entity; end if;
  if v_project_entity is not null and new.entity_id is distinct from v_project_entity then
    raise exception using errcode = '23514', message = 'Project control record legal entity must match project legal entity';
  end if;
  return new;
end;
$$;

create or replace function public.validate_project_dependency_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_pre_project uuid;
  v_post_project uuid;
begin
  select project_id into v_pre_project from public.project_work_items where id = new.predecessor_work_item_id;
  select project_id into v_post_project from public.project_work_items where id = new.successor_work_item_id;
  if v_pre_project is distinct from new.project_id or v_post_project is distinct from new.project_id then
    raise exception using errcode = '23514', message = 'Project dependencies must link work items in the same project';
  end if;
  return public.validate_project_control_scope();
end;
$$;

foreach_table_placeholder: null;

-- Project control tables are server-governed until dedicated mutation routes are certified.
alter table public.project_milestones enable row level security;
alter table public.project_work_items enable row level security;
alter table public.project_dependencies enable row level security;
alter table public.project_risks_issues enable row level security;
alter table public.project_resource_allocations enable row level security;
alter table public.project_budget_lines enable row level security;
alter table public.project_change_requests enable row level security;

-- Scope validation is applied independently so presentation profiles cannot bypass organization/entity ownership.
drop trigger if exists project_milestones_scope on public.project_milestones;
create trigger project_milestones_scope before insert or update on public.project_milestones for each row execute function public.validate_project_control_scope();
drop trigger if exists project_work_items_scope on public.project_work_items;
create trigger project_work_items_scope before insert or update on public.project_work_items for each row execute function public.validate_project_control_scope();
drop trigger if exists project_risks_issues_scope on public.project_risks_issues;
create trigger project_risks_issues_scope before insert or update on public.project_risks_issues for each row execute function public.validate_project_control_scope();
drop trigger if exists project_resource_allocations_scope on public.project_resource_allocations;
create trigger project_resource_allocations_scope before insert or update on public.project_resource_allocations for each row execute function public.validate_project_control_scope();
drop trigger if exists project_budget_lines_scope on public.project_budget_lines;
create trigger project_budget_lines_scope before insert or update on public.project_budget_lines for each row execute function public.validate_project_control_scope();
drop trigger if exists project_change_requests_scope on public.project_change_requests;
create trigger project_change_requests_scope before insert or update on public.project_change_requests for each row execute function public.validate_project_control_scope();
drop trigger if exists project_dependencies_scope on public.project_dependencies;
create trigger project_dependencies_scope before insert or update on public.project_dependencies for each row execute function public.validate_project_dependency_scope();

commit;
