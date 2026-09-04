create index if not exists accounts_receivable_command_center_idx
on public.accounts_receivable (organization_id, entity_id, period_id, due_date)
include (outstanding_balance)
where outstanding_balance > 0;

create index if not exists vendor_invoices_command_center_idx
on public.vendor_invoices (organization_id, entity_id, invoice_date, due_date)
include (outstanding_amount)
where outstanding_amount > 0;

create index if not exists finance_approval_requests_command_center_idx
on public.finance_approval_requests (organization_id, entity_id, period_id, requested_at, id)
include (status);

create index if not exists finance_bank_reconciliation_runs_command_center_idx
on public.finance_bank_reconciliation_runs (organization_id, entity_id, reconciliation_date, id)
include (status, difference_amount);

create index if not exists finance_statutory_filings_command_center_idx
on public.finance_statutory_filings (organization_id, entity_id, period_id, due_date, id)
include (status);

create index if not exists accounting_engagements_command_center_idx
on public.accounting_engagements (accounting_firm_id, created_at, id)
include (organization_id, status);
