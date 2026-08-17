insert into public.finance_posting_rules (
  organization_id, entity_id, name, event_type, source_module,
  debit_account_id, credit_account_id, effective_from, effective_to,
  priority, status
)
select
  r.organization_id,
  r.entity_id,
  v.name,
  v.event_type,
  'PAYROLL',
  r.credit_account_id,
  s.credit_account_id,
  date '2000-01-01',
  null,
  100,
  'ACTIVE'
from public.finance_posting_rules r
join public.finance_posting_rules s
  on s.organization_id = r.organization_id
 and s.entity_id = r.entity_id
 and s.event_type = 'PAYROLL_SETTLEMENT'
 and s.status = 'ACTIVE'
cross join lateral (
  values
    ('PAYROLL_TAX', 'PAYROLL_TAX_SETTLEMENT', 'Payroll Withholding Tax Settlement'),
    ('PAYROLL_SOCIAL_SECURITY', 'PAYROLL_SOCIAL_SECURITY_SETTLEMENT', 'Payroll Social Security Settlement'),
    ('PAYROLL_DEDUCTION', 'PAYROLL_DEDUCTION_SETTLEMENT', 'Payroll Employee Deduction Settlement')
) as v(source_event_type,event_type,name)
where r.event_type = v.source_event_type
  and r.status = 'ACTIVE'
  and not exists (
    select 1
    from public.finance_posting_rules existing
    where existing.organization_id = r.organization_id
      and existing.entity_id = r.entity_id
      and existing.event_type = v.event_type
      and existing.status = 'ACTIVE'
      and existing.effective_to is null
  );
