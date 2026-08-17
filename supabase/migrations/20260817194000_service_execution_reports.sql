create table if not exists public.service_execution_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid null,
  work_order_id uuid not null,
  service_plan_occurrence_id uuid null,
  staff_id uuid not null,
  execution_template_id uuid null,
  execution_template_version integer null,
  execution_template_snapshot jsonb not null default '{}'::jsonb,
  field_responses jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  outcome jsonb not null default '{}'::jsonb,
  follow_up jsonb not null default '{}'::jsonb,
  start_gps jsonb not null default '{}'::jsonb,
  completion_gps jsonb not null default '{}'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, work_order_id)
);

create index if not exists service_execution_reports_org_staff_status_idx
  on public.service_execution_reports (organization_id, staff_id, status);
create index if not exists service_execution_reports_work_order_idx
  on public.service_execution_reports (work_order_id);
create index if not exists service_execution_reports_occurrence_idx
  on public.service_execution_reports (service_plan_occurrence_id)
  where service_plan_occurrence_id is not null;

alter table public.service_execution_reports enable row level security;
revoke all on table public.service_execution_reports from anon, authenticated;
grant select, insert, update, delete on table public.service_execution_reports to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-evidence',
  'service-evidence',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
