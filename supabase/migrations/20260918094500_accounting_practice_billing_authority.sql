begin;

alter table public.accounting_practice_billing_profiles
  add column if not exists billing_entity_id uuid references public.legal_entities(id) on delete set null,
  add column if not exists customer_party_id uuid references public.parties(id) on delete set null,
  add column if not exists revenue_account_id uuid,
  add column if not exists tax_rule_id uuid,
  add column if not exists tax_rate_percent numeric(9,4) not null default 0 check (tax_rate_percent >= 0 and tax_rate_percent <= 100),
  add column if not exists tax_treatment_confirmed boolean not null default false,
  add column if not exists payment_terms_days integer not null default 0 check (payment_terms_days >= 0 and payment_terms_days <= 3650),
  add column if not exists billing_cadence text not null default 'ON_DEMAND' check (billing_cadence in ('ON_DEMAND','MONTHLY','QUARTERLY','ANNUAL')),
  add column if not exists next_billing_date date;

create table if not exists public.accounting_practice_billing_batches (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  engagement_id uuid not null references public.accounting_engagements(id) on delete restrict,
  billing_period_key text not null,
  billing_profile_id uuid not null references public.accounting_practice_billing_profiles(id) on delete restrict,
  invoice_id uuid,
  time_entry_ids uuid[] not null default '{}',
  service_period_start date,
  service_period_end date,
  subtotal numeric(18,4) not null check (subtotal >= 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  total_amount numeric(18,4) not null check (total_amount >= 0),
  currency_code text not null,
  status text not null default 'PREPARING' check (status in ('PREPARING','INVOICED','FAILED','VOID')),
  idempotency_key text not null,
  prepared_by uuid references public.staff_accounts(id) on delete set null,
  prepared_at timestamptz not null default now(),
  invoiced_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accounting_firm_id, idempotency_key)
);

create index if not exists accounting_practice_billing_batches_engagement_idx
  on public.accounting_practice_billing_batches (accounting_firm_id, engagement_id, created_at desc);

alter table public.accounting_practice_billing_batches enable row level security;
revoke all on table public.accounting_practice_billing_batches from anon, authenticated;
grant select, insert, update, delete on table public.accounting_practice_billing_batches to service_role;

comment on table public.accounting_practice_billing_batches is
  'Durable handoff from approved accounting-practice WIP into the canonical Finance customer-invoice authority. A batch records exact time-entry scope and idempotency evidence.';

commit;
