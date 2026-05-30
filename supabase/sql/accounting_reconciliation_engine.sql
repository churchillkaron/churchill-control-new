create table if not exists balance_sheet_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reporting_period text not null,
  total_assets numeric(14,2) default 0,
  total_liabilities numeric(14,2) default 0,
  total_equity numeric(14,2) default 0,
  generated_at timestamptz default now()
);

create table if not exists cash_reconciliation_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  cash_book_balance numeric(14,2) default 0,
  bank_balance numeric(14,2) default 0,
  variance_amount numeric(14,2) default 0,
  reconciliation_status text default 'matched',
  created_at timestamptz default now()
);

create table if not exists account_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_code text not null,
  ledger_balance numeric(14,2) default 0,
  source_balance numeric(14,2) default 0,
  variance_amount numeric(14,2) default 0,
  reconciliation_status text default 'matched',
  created_at timestamptz default now()
);
