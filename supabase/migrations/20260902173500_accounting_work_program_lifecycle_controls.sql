begin;

alter table public.accounting_client_profiles
  add column if not exists assigned_partner_id uuid,
  add column if not exists assigned_partner_name text;

alter table public.accounting_engagement_runs
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid,
  add column if not exists completion_snapshot jsonb not null default '{}'::jsonb;

alter table public.accounting_engagement_work_items
  add column if not exists completed_by uuid;

alter table public.accounting_client_requests
  add column if not exists accepted_by uuid,
  add column if not exists changes_requested_at timestamptz,
  add column if not exists changes_requested_by uuid;

revoke all on table public.accounting_work_program_templates from anon, authenticated;
revoke all on table public.accounting_work_program_template_steps from anon, authenticated;
revoke all on table public.accounting_engagement_runs from anon, authenticated;
revoke all on table public.accounting_engagement_work_items from anon, authenticated;
revoke all on table public.accounting_client_requests from anon, authenticated;

grant select, insert, update, delete on table public.accounting_work_program_templates to service_role;
grant select, insert, update, delete on table public.accounting_work_program_template_steps to service_role;
grant select, insert, update, delete on table public.accounting_engagement_runs to service_role;
grant select, insert, update, delete on table public.accounting_engagement_work_items to service_role;
grant select, insert, update, delete on table public.accounting_client_requests to service_role;

commit;
