create or replace function public.finance_command_center_metrics(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with receivables as (
  select
    count(*)::bigint as count,
    coalesce(sum(ar.outstanding_balance), 0)::numeric as amount,
    count(*) filter (
      where p_period_end is not null
        and ar.due_date is not null
        and ar.due_date < p_period_end
    )::bigint as overdue
  from public.accounts_receivable ar
  where ar.organization_id = p_organization_id
    and ar.entity_id = p_entity_id
    and ar.period_id = p_period_id
    and ar.outstanding_balance > 0
),
payables as (
  select
    count(*)::bigint as count,
    coalesce(sum(vi.outstanding_amount), 0)::numeric as amount,
    count(*) filter (
      where p_period_end is not null
        and vi.due_date is not null
        and vi.due_date < p_period_end
    )::bigint as overdue
  from public.vendor_invoices vi
  where vi.organization_id = p_organization_id
    and vi.entity_id = p_entity_id
    and vi.outstanding_amount > 0
    and (p_period_start is null or vi.invoice_date >= p_period_start)
    and (p_period_end is null or vi.invoice_date <= p_period_end)
),
approvals as (
  select count(*)::bigint as count
  from public.finance_approval_requests far
  where far.organization_id = p_organization_id
    and far.entity_id = p_entity_id
    and far.period_id = p_period_id
    and lower(trim(coalesce(far.status, ''))) in ('pending', 'requested', 'open')
),
reconciliation as (
  select
    count(*)::bigint as count,
    coalesce(sum(fbr.difference_amount), 0)::numeric as difference
  from public.finance_bank_reconciliation_runs fbr
  where fbr.organization_id = p_organization_id
    and fbr.entity_id = p_entity_id
    and (p_period_start is null or fbr.reconciliation_date >= p_period_start)
    and (p_period_end is null or fbr.reconciliation_date <= p_period_end)
    and (
      regexp_replace(lower(trim(coalesce(fbr.status, ''))), '[[:space:]-]+', '_', 'g') not in
        ('complete', 'completed', 'closed', 'done', 'passed', 'posted', 'submitted', 'approved')
      or abs(coalesce(fbr.difference_amount, 0)) > 0.000001
    )
),
filings as (
  select
    count(*)::bigint as count,
    count(*) filter (
      where p_period_end is not null
        and fsf.due_date is not null
        and fsf.due_date < p_period_end
    )::bigint as overdue
  from public.finance_statutory_filings fsf
  where fsf.organization_id = p_organization_id
    and fsf.entity_id = p_entity_id
    and fsf.period_id = p_period_id
    and regexp_replace(lower(trim(coalesce(fsf.status, ''))), '[[:space:]-]+', '_', 'g') not in
      ('complete', 'completed', 'closed', 'done', 'passed', 'posted', 'submitted', 'approved')
),
review_items as (
  select
    count(*)::bigint as count,
    count(*) filter (where upper(trim(coalesce(fri.status, ''))) = 'READY_FOR_REVIEW')::bigint as ready,
    count(*) filter (where upper(trim(coalesce(fri.status, ''))) = 'CHANGES_REQUESTED')::bigint as changes_requested,
    count(*) filter (
      where fri.due_at is not null
        and fri.due_at::date < coalesce(p_period_end, current_date)
    )::bigint as overdue
  from public.finance_review_items fri
  where fri.organization_id = p_organization_id
    and upper(trim(coalesce(fri.status, ''))) in ('OPEN', 'IN_PREPARATION', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED')
    and (fri.entity_id is null or fri.entity_id = p_entity_id)
    and (fri.period_id is null or fri.period_id = p_period_id)
),
practice as (
  select count(*)::bigint as active_clients
  from public.accounting_engagements ae
  where ae.accounting_firm_id = p_organization_id
    and lower(trim(coalesce(ae.status, ''))) in ('active', 'enabled')
),
approval_samples as (
  select coalesce(jsonb_agg(to_jsonb(sample_row) order by sample_row.requested_at asc nulls last, sample_row.id asc), '[]'::jsonb) as rows
  from (
    select far.id, far.document_type, far.document_id, far.amount, far.currency_code, far.assigned_role, far.status, far.requested_at, far.decision_notes
    from public.finance_approval_requests far
    where far.organization_id = p_organization_id
      and far.entity_id = p_entity_id
      and far.period_id = p_period_id
      and lower(trim(coalesce(far.status, ''))) in ('pending', 'requested', 'open')
    order by far.requested_at asc nulls last, far.id asc
    limit 5
  ) sample_row
),
reconciliation_samples as (
  select coalesce(jsonb_agg(to_jsonb(sample_row) order by sample_row.reconciliation_date desc nulls last, sample_row.id asc), '[]'::jsonb) as rows
  from (
    select fbr.id, fbr.bank_account_id, fbr.bank_statement_id, fbr.reconciliation_date, fbr.book_closing_balance, fbr.statement_closing_balance, fbr.difference_amount, fbr.status, fbr.notes, fbr.created_at
    from public.finance_bank_reconciliation_runs fbr
    where fbr.organization_id = p_organization_id
      and fbr.entity_id = p_entity_id
      and (p_period_start is null or fbr.reconciliation_date >= p_period_start)
      and (p_period_end is null or fbr.reconciliation_date <= p_period_end)
      and (
        regexp_replace(lower(trim(coalesce(fbr.status, ''))), '[[:space:]-]+', '_', 'g') not in
          ('complete', 'completed', 'closed', 'done', 'passed', 'posted', 'submitted', 'approved')
        or abs(coalesce(fbr.difference_amount, 0)) > 0.000001
      )
    order by fbr.reconciliation_date desc nulls last, fbr.id asc
    limit 5
  ) sample_row
),
filing_samples as (
  select coalesce(jsonb_agg(to_jsonb(sample_row) order by sample_row.due_date asc nulls last, sample_row.id asc), '[]'::jsonb) as rows
  from (
    select fsf.id, fsf.filing_type, fsf.jurisdiction_code, fsf.authority_name, fsf.period_start, fsf.period_end, fsf.due_date, fsf.submission_reference, fsf.submitted_at, fsf.status, fsf.notes
    from public.finance_statutory_filings fsf
    where fsf.organization_id = p_organization_id
      and fsf.entity_id = p_entity_id
      and fsf.period_id = p_period_id
      and regexp_replace(lower(trim(coalesce(fsf.status, ''))), '[[:space:]-]+', '_', 'g') not in
        ('complete', 'completed', 'closed', 'done', 'passed', 'posted', 'submitted', 'approved')
    order by fsf.due_date asc nulls last, fsf.id asc
    limit 5
  ) sample_row
),
review_samples as (
  select coalesce(jsonb_agg(to_jsonb(sample_row) order by sample_row.due_at asc nulls last, sample_row.updated_at desc, sample_row.id asc), '[]'::jsonb) as rows
  from (
    select fri.id, fri.entity_id, fri.period_id, fri.capability_id, fri.record_key, fri.record_type, fri.record_label, fri.status, fri.priority, fri.due_at, fri.preparer_id, fri.reviewer_id, fri.updated_at
    from public.finance_review_items fri
    where fri.organization_id = p_organization_id
      and upper(trim(coalesce(fri.status, ''))) in ('OPEN', 'IN_PREPARATION', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED')
      and (fri.entity_id is null or fri.entity_id = p_entity_id)
      and (fri.period_id is null or fri.period_id = p_period_id)
    order by fri.due_at asc nulls last, fri.updated_at desc, fri.id asc
    limit 12
  ) sample_row
),
engagement_samples as (
  select coalesce(jsonb_agg(to_jsonb(sample_row) order by sample_row.created_at asc, sample_row.id asc), '[]'::jsonb) as rows
  from (
    select ae.id, ae.organization_id, ae.service_package, ae.status, ae.bookkeeping_enabled, ae.vat_enabled, ae.payroll_enabled, ae.tax_enabled, ae.reporting_enabled, ae.audit_enabled, ae.renewal_date, ae.year_end_date, ae.created_at
    from public.accounting_engagements ae
    where ae.accounting_firm_id = p_organization_id
      and lower(trim(coalesce(ae.status, ''))) in ('active', 'enabled')
    order by ae.created_at asc, ae.id asc
    limit 8
  ) sample_row
)
select jsonb_build_object(
  'receivables', jsonb_build_object('count', receivables.count, 'amount', receivables.amount, 'overdue', receivables.overdue),
  'payables', jsonb_build_object('count', payables.count, 'amount', payables.amount, 'overdue', payables.overdue),
  'approvals', jsonb_build_object('count', approvals.count),
  'reconciliation', jsonb_build_object('count', reconciliation.count, 'difference', reconciliation.difference),
  'filings', jsonb_build_object('count', filings.count, 'overdue', filings.overdue),
  'review', jsonb_build_object('count', review_items.count, 'ready', review_items.ready, 'changes_requested', review_items.changes_requested, 'overdue', review_items.overdue),
  'practice', jsonb_build_object('active_clients', practice.active_clients),
  'samples', jsonb_build_object(
    'approvals', approval_samples.rows,
    'reconciliations', reconciliation_samples.rows,
    'filings', filing_samples.rows,
    'reviews', review_samples.rows,
    'engagements', engagement_samples.rows
  )
)
from receivables, payables, approvals, reconciliation, filings, review_items, practice,
  approval_samples, reconciliation_samples, filing_samples, review_samples, engagement_samples;
$$;

revoke all privileges on function public.finance_command_center_metrics(uuid, uuid, uuid, date, date) from public;
revoke all privileges on function public.finance_command_center_metrics(uuid, uuid, uuid, date, date) from anon;
revoke all privileges on function public.finance_command_center_metrics(uuid, uuid, uuid, date, date) from authenticated;
grant execute on function public.finance_command_center_metrics(uuid, uuid, uuid, date, date) to service_role;

comment on function public.finance_command_center_metrics(uuid, uuid, uuid, date, date)
is 'Server-only exact Finance command-center aggregate and bounded action samples. Authorization remains in the application route; execution is restricted to service_role.';
