begin;

alter table public.commercial_quotations
  add column if not exists quotation_date date;

create table if not exists public.finance_historical_customer_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  customer_invoice_id uuid not null references public.customer_invoices(id) on delete cascade,
  source_system text not null,
  source_document_id uuid,
  receipt_number text,
  paid_date date not null,
  amount numeric(18,2) not null,
  currency_code text not null,
  payment_method text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_historical_customer_payment_evidence_amount_positive check (amount > 0),
  constraint finance_historical_customer_payment_evidence_unique unique (
    organization_id, entity_id, customer_invoice_id, source_system
  )
);
create index if not exists finance_historical_customer_payment_evidence_invoice_idx
  on public.finance_historical_customer_payment_evidence (
    organization_id, entity_id, customer_invoice_id, paid_date desc
  );

alter table public.finance_historical_customer_payment_evidence enable row level security;
revoke all on table public.finance_historical_customer_payment_evidence
  from public, anon, authenticated;
grant select, insert, update, delete on table public.finance_historical_customer_payment_evidence
  to service_role;

comment on table public.finance_historical_customer_payment_evidence is
  'Verified historical receipt evidence imported from legacy systems. Does not create bank or ledger effects.';
comment on column public.commercial_quotations.quotation_date is
  'Commercial document issue date. Distinct from system created_at.';

commit;
