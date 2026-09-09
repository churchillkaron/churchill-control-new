begin;

with source(quotation_number, quotation_date) as (
  values
    ('QT-2026-0017', date '2026-07-03'),
    ('QT-2026-0018', date '2026-07-07'),
    ('QT-2026-0019', date '2026-07-08'),
    ('QT-2026-0020', date '2026-07-15'),
    ('QT-2026-0021', date '2026-07-15'),
    ('QT-2026-0022', date '2026-07-27')
)
update public.commercial_quotations q
set quotation_date = source.quotation_date,
    updated_at = now()
from source
where q.quotation_number = source.quotation_number
  and q.customer_name is not null
  and q.notes ilike '%Imported from coleley.com.%'
  and exists (
    select 1 from public.organizations o
    where o.id = q.organization_id
      and o.name = 'Cole Ley Co., Ltd.'
  )
  and q.quotation_date is distinct from source.quotation_date;

with source(invoice_number, paid_date, receipt_number, amount, legacy_status) as (
  values
    ('CL-2026-06-001', date '2026-07-13', 'RC-2026-0003', 25000::numeric, 'pending'),
    ('CL-2026-06-003', date '2026-06-11', 'RC-2026-0002', 25000::numeric, 'paid'),
    ('CL-2026-06-004', date '2026-07-13', 'RC-2026-0005', 25000::numeric, 'paid'),
    ('CL-2026-06-006', date '2026-07-13', 'RC-2026-0006', 25000::numeric, 'paid'),
    ('CL-2026-06-007', date '2026-07-31', 'RC-2026-0008', 10000::numeric, 'paid'),
    ('CL-2026-06-008', date '2026-07-13', 'RC-2026-0004', 25000::numeric, 'paid'),
    ('CL-2026-07-003', date '2026-07-31', 'RC-2026-0009', 10000::numeric, 'paid'),
    ('CL-2026-07-004', date '2026-08-14', 'RC-2026-0012', 25000::numeric, 'paid'),
    ('CL-2026-07-005', date '2026-07-31', 'RC-2026-0010', 10000::numeric, 'paid'),
    ('CL-2026-07-006', date '2026-08-14', 'RC-2026-0013', 25000::numeric, 'paid'),
    ('CL-2026-07-007', date '2026-07-31', 'RC-2026-0011', 10000::numeric, 'paid'),
    ('CL-2026-07-008', date '2026-08-14', 'RC-2026-0014', 25000::numeric, 'paid'),
    ('CL-2026-07-009', date '2026-08-23', 'RC-2026-0016', 8000::numeric, 'paid'),
    ('CL-2026-07-010', date '2026-08-14', 'RC-2026-0015', 25000::numeric, 'paid'),
    ('CL-2026-07-011', date '2026-08-23', 'RC-2026-0017', 8000::numeric, 'paid'),
    ('CL-2026-07-012', date '2026-07-31', 'RC-2026-0007', 75000::numeric, 'paid'),
    ('CL-2026-08-004', date '2026-08-31', 'RC-2026-0022', 25000::numeric, 'paid'),
    ('CL-2026-08-005', date '2026-08-31', 'RC-2026-0021', 25000::numeric, 'paid'),
    ('CL-2026-08-007', date '2026-08-31', 'RC-2026-0020', 25000::numeric, 'paid'),
    ('CL-2026-08-008', date '2026-08-31', 'RC-2026-0019', 25000::numeric, 'paid'),
    ('CL-2026-08-011', date '2026-08-31', 'RC-2026-0018', 25000::numeric, 'paid')
)
insert into public.finance_historical_customer_payment_evidence (
  organization_id, entity_id, customer_invoice_id, source_system,
  source_document_id, receipt_number, paid_date, amount, currency_code,
  payment_method, evidence
)
select
  ci.organization_id,
  ci.entity_id,
  ci.id,
  'coleley.com',
  ci.source_document_id,
  source.receipt_number,
  source.paid_date,
  source.amount,
  coalesce(ci.currency_code, 'THB'),
  null,
  jsonb_build_object(
    'legacy_status', source.legacy_status,
    'invoice_number', source.invoice_number,
    'source_document_type', ci.source_document_type
  )
from source
join public.customer_invoices ci
  on ci.invoice_number = source.invoice_number
 and ci.source_document_type = 'LEGACY_COLELEY_INVOICE'
where ci.status = 'PAID'
  and abs(ci.total_amount - source.amount) < 0.01
  and exists (
    select 1 from public.organizations o
    where o.id = ci.organization_id
      and o.name = 'Cole Ley Co., Ltd.'
  )
on conflict (organization_id, entity_id, customer_invoice_id, source_system)
do update set
  receipt_number = excluded.receipt_number,
  paid_date = excluded.paid_date,
  amount = excluded.amount,
  currency_code = excluded.currency_code,
  evidence = excluded.evidence,
  updated_at = now();

commit;
