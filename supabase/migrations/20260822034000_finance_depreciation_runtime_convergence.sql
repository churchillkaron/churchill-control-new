-- Finance depreciation close-out.
-- Make depreciation runs and asset entries retry-safe and seed the canonical
-- posting rule from each entity's own chart of accounts without hard-coded IDs.

CREATE UNIQUE INDEX IF NOT EXISTS finance_depreciation_runs_scope_period_uidx
  ON public.finance_depreciation_runs (
    organization_id,
    entity_id,
    book_reference,
    period_start,
    period_end
  );

CREATE UNIQUE INDEX IF NOT EXISTS depreciation_entries_idempotency_uidx
  ON public.depreciation_entries (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

INSERT INTO public.finance_posting_rules (
  organization_id,
  entity_id,
  name,
  event_type,
  source_module,
  debit_account_id,
  credit_account_id,
  effective_from,
  priority,
  status
)
SELECT
  expense.organization_id,
  expense.entity_id,
  'Fixed asset depreciation',
  'DEPRECIATION_POSTED',
  'FIXED_ASSETS',
  expense.id,
  accumulated.id,
  DATE '2000-01-01',
  100,
  'ACTIVE'
FROM public.chart_of_accounts expense
JOIN public.chart_of_accounts accumulated
  ON accumulated.organization_id = expense.organization_id
 AND accumulated.entity_id IS NOT DISTINCT FROM expense.entity_id
WHERE expense.account_code = '6110'
  AND accumulated.account_code = '1590'
  AND COALESCE(expense.is_active, true) = true
  AND COALESCE(accumulated.is_active, true) = true
  AND expense.entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.finance_posting_rules existing
    WHERE existing.organization_id = expense.organization_id
      AND existing.entity_id IS NOT DISTINCT FROM expense.entity_id
      AND existing.event_type = 'DEPRECIATION_POSTED'
      AND existing.source_module = 'FIXED_ASSETS'
      AND existing.status = 'ACTIVE'
  );
