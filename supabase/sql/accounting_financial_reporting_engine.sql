create table if not exists accounting_journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  journal_date date not null,
  reference_type text,
  reference_id text,
  account_code text not null,
  entry_type text not null,
  amount numeric(14,2) default 0,
  description text,
  created_at timestamptz default now()
);

create table if not exists trial_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_code text not null,
  debit_balance numeric(14,2) default 0,
  credit_balance numeric(14,2) default 0,
  balance_difference numeric(14,2) default 0,
  snapshot_date timestamptz default now()
);

create table if not exists financial_statement_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  statement_type text not null,
  reporting_period text not null,
  total_revenue numeric(14,2) default 0,
  total_expenses numeric(14,2) default 0,
  net_income numeric(14,2) default 0,
  generated_at timestamptz default now()
);
