begin;

alter table public.accounting_work_program_templates enable row level security;
alter table public.accounting_work_program_template_steps enable row level security;
alter table public.accounting_engagement_runs enable row level security;
alter table public.accounting_engagement_work_items enable row level security;
alter table public.accounting_client_requests enable row level security;

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
