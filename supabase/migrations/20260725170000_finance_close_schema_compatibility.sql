begin;

-- Compatibility bridge for databases where earlier Finance configuration
-- migrations created these relations with a narrower legacy shape.
-- CREATE TABLE IF NOT EXISTS does not add missing columns to an existing table,
-- so every column consumed by the close-step migration is added explicitly.

create table if not exists public.finance_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  entity_id uuid,
  from_currency text,
  to_currency text,
  rate numeric,
  effective_date date,
  source text,
  status text default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.finance_exchange_rates
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists from_currency text,
  add column if not exists to_currency text,
  add column if not exists rate numeric,
  add column if not exists effective_date date,
  add column if not exists source text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.finance_fx_revaluation_accounts (
  organization_id uuid,
  entity_id uuid,
  account_id uuid,
  status text default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.finance_fx_revaluation_accounts
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists account_id uuid,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.finance_tax_close_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  entity_id uuid,
  tax_type text,
  recoverable_tax_account_id uuid,
  payable_tax_account_id uuid,
  settlement_account_id uuid,
  status text default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.finance_tax_close_configurations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists tax_type text,
  add column if not exists recoverable_tax_account_id uuid,
  add column if not exists payable_tax_account_id uuid,
  add column if not exists settlement_account_id uuid,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.currency_revaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  entity_id uuid,
  period_id uuid,
  account_id uuid,
  base_currency text,
  target_currency text,
  old_value numeric default 0,
  new_value numeric default 0,
  gain_loss numeric default 0,
  closing_rate numeric,
  journal_entry_id uuid,
  idempotency_key text,
  created_at timestamptz default now()
);

alter table public.currency_revaluations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists account_id uuid,
  add column if not exists base_currency text,
  add column if not exists target_currency text,
  add column if not exists old_value numeric default 0,
  add column if not exists new_value numeric default 0,
  add column if not exists gain_loss numeric default 0,
  add column if not exists closing_rate numeric,
  add column if not exists journal_entry_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists created_at timestamptz default now();

create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  entity_id uuid,
  period_id uuid,
  bank_account_id uuid,
  transaction_date date,
  description text,
  amount numeric,
  direction text,
  reference_number text,
  matched boolean,
  matched_at timestamptz,
  ledger_reference_id uuid,
  created_at timestamptz default now()
);

alter table public.bank_statements
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists bank_account_id uuid,
  add column if not exists transaction_date date,
  add column if not exists description text,
  add column if not exists amount numeric,
  add column if not exists direction text,
  add column if not exists reference_number text,
  add column if not exists matched boolean,
  add column if not exists matched_at timestamptz,
  add column if not exists ledger_reference_id uuid,
  add column if not exists created_at timestamptz default now();

alter table public.bank_ledger
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists bank_account_id uuid,
  add column if not exists amount numeric,
  add column if not exists direction text,
  add column if not exists reference_id text,
  add column if not exists reconciled_statement_id uuid,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid,
  add column if not exists created_at timestamptz default now();

comment on table public.finance_exchange_rates is
  'Organization and optional entity scoped effective-dated exchange-rate configuration used by Finance runtimes.';

notify pgrst, 'reload schema';

commit;
