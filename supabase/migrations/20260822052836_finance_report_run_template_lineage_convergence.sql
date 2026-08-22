alter table public.finance_report_runs
  add column if not exists report_template_id uuid;

alter table public.finance_report_runs
  alter column report_definition_id drop not null;

create index if not exists finance_report_runs_template_idx
  on public.finance_report_runs (organization_id, report_template_id, created_at desc);

create index if not exists finance_report_runs_schedule_idx
  on public.finance_report_runs (organization_id, scheduled_report_id, created_at desc);