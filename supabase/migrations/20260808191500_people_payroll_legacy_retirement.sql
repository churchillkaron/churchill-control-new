begin;

insert into public.payroll_audit_logs (
  id,
  payroll_period,
  action,
  performed_by,
  target_staff_id,
  notes,
  created_at,
  organization_id,
  target_party_id
)
select
  gen_random_uuid(),
  to_char(sc.confirmed_at, 'YYYY-MM'),
  'LEGACY_SALARY_CONFIRMATION_ARCHIVED',
  'SYSTEM_MIGRATION',
  null,
  jsonb_build_object(
    'legacy_table', 'salary_confirmations',
    'legacy_id', sc.id,
    'legacy_staff_id', sc.staff_id,
    'legacy_email', sc.email,
    'confirmed_at', sc.confirmed_at,
    'organization_id', sc.organization_id
  )::text,
  sc.confirmed_at,
  sc.organization_id,
  null
from public.salary_confirmations sc
where not exists (
  select 1
  from public.payroll_audit_logs pal
  where pal.action = 'LEGACY_SALARY_CONFIRMATION_ARCHIVED'
    and pal.notes like '%' || sc.id::text || '%'
);

drop table if exists public.salary_confirmations;
drop table if exists public.salary_approvals;
drop table if exists public.staff_salary_records;
drop table if exists public.staff_members;

commit;
