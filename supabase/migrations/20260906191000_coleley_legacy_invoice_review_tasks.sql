-- Surface the four deliberately quarantined Cole Ley legacy invoices as governed Finance review work.
--
-- This migration MUST NOT infer payment truth, change invoice status, or create receivable impact.
-- The source invoices remain DRAFT with zero outstanding amounts until a human reconciles the
-- same-customer/same-date ambiguity through the normal Finance review workflow.

with candidates as (
  select
    ci.organization_id,
    ci.id as invoice_id,
    ci.invoice_number,
    ci.invoice_date,
    ci.total_amount,
    ci.status as invoice_status,
    ci.source_document_type,
    ci.source_document_id
  from public.customer_invoices ci
  where ci.organization_id = '9550b843-b83c-4d15-b02d-a0b5ca23346e'::uuid
    and ci.status = 'DRAFT'
    and ci.source_document_type = 'LEGACY_COLELEY_INVOICE'
    and coalesce(ci.notes, '') ilike '%review_required_same_customer_same_date%'
), inserted as (
  insert into public.finance_review_items (
    organization_id,
    entity_id,
    period_id,
    capability_id,
    record_key,
    record_type,
    record_label,
    status,
    priority,
    preparer_id,
    created_by,
    metadata
  )
  select
    c.organization_id,
    null,
    null,
    'customer_invoices',
    c.invoice_id::text,
    'customer_invoice',
    c.invoice_number,
    'OPEN',
    'HIGH',
    null,
    null,
    jsonb_build_object(
      'source', 'coleley_legacy_migration',
      'migration_origin', 'system',
      'invoice_id', c.invoice_id,
      'invoice_number', c.invoice_number,
      'invoice_date', c.invoice_date,
      'total_amount', c.total_amount,
      'invoice_status', c.invoice_status,
      'source_document_type', c.source_document_type,
      'source_document_id', c.source_document_id,
      'payment_truth', 'review_required_same_customer_same_date',
      'review_reason', 'Same customer/tax identity has multiple legacy invoices on the same invoice date; payment truth cannot be inferred safely.',
      'accounting_guard', 'Invoice remains DRAFT and excluded from receivable impact until human reconciliation.',
      'receivable_effect', 'zero_until_reconciled'
    )
  from candidates c
  where not exists (
    select 1
    from public.finance_review_items fri
    where fri.organization_id = c.organization_id
      and fri.capability_id = 'customer_invoices'
      and fri.record_key = c.invoice_id::text
      and fri.period_id is null
  )
  returning *
)
insert into public.organization_audit_logs (
  organization_id,
  entity_type,
  entity_id,
  action,
  before_data,
  after_data,
  metadata,
  actor_email
)
select
  i.organization_id,
  'finance_review',
  i.id::text,
  'FINANCE_REVIEW_CREATED',
  null,
  to_jsonb(i),
  jsonb_build_object(
    'capability_id', i.capability_id,
    'record_key', i.record_key,
    'source', 'coleley_legacy_migration',
    'actor_type', 'system_migration'
  ),
  null
from inserted i;
