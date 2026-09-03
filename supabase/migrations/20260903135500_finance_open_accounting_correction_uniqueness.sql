-- Prevent concurrent or repeated active accounting correction cases for the same source exception.
create unique index if not exists finance_approval_requests_open_accounting_correction_uniq
on public.finance_approval_requests (
  organization_id,
  entity_id,
  period_id,
  (metadata->>'client_organization_id'),
  (metadata->'exception'->>'account_id')
)
where document_type = 'ACCOUNTING_CORRECTION'
  and upper(status) in ('DRAFT','REJECTED','PENDING','APPROVED')
  and entity_id is not null
  and period_id is not null
  and (metadata->>'client_organization_id') is not null
  and (metadata->'exception'->>'account_id') is not null;
