begin;

create table if not exists public.finance_opening_balance_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  period_id uuid,
  reference text not null,
  posting_date date not null,
  currency_code text not null,
  description text,
  lines jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT',
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_opening_balance_batches_idempotency_uidx
  on public.finance_opening_balance_batches (organization_id, entity_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.finance_recurring_journal_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  name text not null,
  reference text,
  frequency text not null,
  next_run_date date not null,
  end_date date,
  currency_code text not null,
  description text,
  lines jsonb not null default '[]'::jsonb,
  status text not null default 'ACTIVE',
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_recurring_journal_templates_name_uidx
  on public.finance_recurring_journal_templates (organization_id, entity_id, name);

create table if not exists public.finance_collection_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_id uuid not null,
  customer_invoice_id uuid,
  accounts_receivable_id uuid,
  case_reference text not null,
  opened_date date not null,
  priority text not null,
  owner_id uuid,
  promised_payment_date date,
  notes text,
  status text not null default 'OPEN',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_collection_cases_reference_uidx
  on public.finance_collection_cases (organization_id, entity_id, case_reference);

create table if not exists public.finance_revenue_recognition_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_id uuid,
  source_document_type text not null,
  source_document_id uuid,
  contract_reference text,
  recognition_method text not null,
  start_date date not null,
  end_date date not null,
  total_amount numeric(20,6) not null,
  currency_code text not null,
  revenue_account_id uuid not null,
  deferred_revenue_account_id uuid,
  notes text,
  status text not null default 'DRAFT',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  bank_account_id uuid not null,
  statement_number text not null,
  statement_start_date date not null,
  statement_end_date date not null,
  opening_balance numeric(20,6) not null,
  closing_balance numeric(20,6) not null,
  currency_code text not null,
  source_file_url text,
  import_reference text,
  status text not null default 'IMPORTED',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_bank_statement_imports_uidx
  on public.finance_bank_statement_imports (organization_id, entity_id, bank_account_id, statement_number);

create table if not exists public.finance_bank_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  bank_account_id uuid not null,
  bank_statement_id uuid,
  reconciliation_date date not null,
  book_closing_balance numeric(20,6),
  statement_closing_balance numeric(20,6),
  difference_amount numeric(20,6),
  notes text,
  status text not null default 'OPEN',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_fx_revaluation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  period_id uuid,
  revaluation_date date not null,
  currency_code text not null,
  rate_source text not null,
  unrealized_gain_account_id uuid not null,
  unrealized_loss_account_id uuid not null,
  notes text,
  status text not null default 'DRAFT',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_vat_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  registration_reference text not null,
  jurisdiction_code text not null,
  period_start date not null,
  period_end date not null,
  filing_due_date date,
  currency_code text not null,
  notes text,
  status text not null default 'DRAFT',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_vat_returns_period_uidx
  on public.finance_vat_returns (organization_id, entity_id, registration_reference, period_start, period_end);

create table if not exists public.finance_depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  period_id uuid,
  book_reference text not null,
  period_start date not null,
  period_end date not null,
  posting_date date not null,
  notes text,
  status text not null default 'DRAFT',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_statutory_filings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  filing_type text not null,
  jurisdiction_code text not null,
  authority_name text,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  submission_reference text,
  notes text,
  status text not null default 'DRAFT',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_report_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  report_type text not null,
  description text,
  definition_json jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_report_templates_name_uidx
  on public.finance_report_templates (organization_id, name);

create table if not exists public.finance_scheduled_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  report_template_id uuid not null,
  name text not null,
  frequency text not null,
  next_run_at timestamptz not null,
  recipient_list text not null,
  delivery_format text not null,
  timezone text not null,
  status text not null default 'ACTIVE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_organization_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique,
  legal_name text not null,
  country_code text not null,
  functional_currency text not null,
  reporting_currency text,
  accounting_standard text not null,
  fiscal_year_start_month integer not null check (fiscal_year_start_month between 1 and 12),
  timezone text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_accounting_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  setting_key text not null,
  name text not null,
  value_json jsonb not null default '{}'::jsonb,
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_accounting_settings_effective_uidx
  on public.finance_accounting_settings (organization_id, setting_key, effective_from);

create table if not exists public.finance_number_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  document_type text not null,
  prefix text,
  suffix text,
  next_number bigint not null check (next_number > 0),
  padding integer not null check (padding between 1 and 20),
  reset_policy text not null,
  status text not null default 'ACTIVE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_number_sequences_scope_uidx
  on public.finance_number_sequences (organization_id, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type);

create table if not exists public.finance_posting_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  name text not null,
  event_type text not null,
  source_module text not null,
  debit_account_id uuid not null,
  credit_account_id uuid not null,
  effective_from date not null,
  effective_to date,
  priority integer not null default 100,
  status text not null default 'ACTIVE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_approval_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  name text not null,
  document_type text not null,
  threshold_amount numeric(20,6),
  currency_code text,
  approver_role text not null,
  required_approvals integer not null default 1 check (required_approvals > 0),
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_government_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  authority_name text not null,
  jurisdiction_code text not null,
  connection_type text not null,
  credential_reference text,
  last_verified_at timestamptz,
  status text not null default 'DISCONNECTED',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_banking_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_name text not null,
  connection_type text not null,
  bank_account_id uuid,
  credential_reference text,
  last_sync_at timestamptz,
  status text not null default 'DISCONNECTED',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  base_currency text not null,
  quote_currency text not null,
  effective_date date not null,
  rate numeric(24,10) not null check (rate > 0),
  source text not null,
  rate_type text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base_currency <> quote_currency)
);
create unique index if not exists finance_exchange_rates_effective_uidx
  on public.finance_exchange_rates (organization_id, base_currency, quote_currency, effective_date, rate_type);

create table if not exists public.finance_e_invoicing_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  network text not null,
  jurisdiction_code text not null,
  document_type text not null,
  sender_identifier text not null,
  credential_reference text,
  status text not null default 'INACTIVE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  document_type text not null,
  locale text not null,
  version integer not null default 1 check (version > 0),
  template_source_url text not null,
  status text not null default 'ACTIVE',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_document_templates_version_uidx
  on public.finance_document_templates (organization_id, name, version);

alter table public.finance_opening_balance_batches enable row level security;
alter table public.finance_recurring_journal_templates enable row level security;
alter table public.finance_collection_cases enable row level security;
alter table public.finance_revenue_recognition_schedules enable row level security;
alter table public.finance_bank_statement_imports enable row level security;
alter table public.finance_bank_reconciliation_runs enable row level security;
alter table public.finance_fx_revaluation_runs enable row level security;
alter table public.finance_vat_returns enable row level security;
alter table public.finance_depreciation_runs enable row level security;
alter table public.finance_statutory_filings enable row level security;
alter table public.finance_report_templates enable row level security;
alter table public.finance_scheduled_reports enable row level security;
alter table public.finance_organization_profiles enable row level security;
alter table public.finance_accounting_settings enable row level security;
alter table public.finance_number_sequences enable row level security;
alter table public.finance_posting_rules enable row level security;
alter table public.finance_approval_workflows enable row level security;
alter table public.finance_government_connections enable row level security;
alter table public.finance_banking_integrations enable row level security;
alter table public.finance_exchange_rates enable row level security;
alter table public.finance_e_invoicing_settings enable row level security;
alter table public.finance_document_templates enable row level security;

notify pgrst, 'reload schema';
commit;
