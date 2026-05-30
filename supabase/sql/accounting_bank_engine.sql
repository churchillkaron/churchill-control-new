create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  currency text default 'THB',
  current_balance numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists bank_transaction_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  bank_account_id uuid not null,
  transaction_date timestamptz,
  reference text,
  description text,
  amount numeric(14,2) default 0,
  transaction_type text,
  reconciliation_status text default 'unreconciled',
  created_at timestamptz default now()
);

create table if not exists bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  bank_account_id uuid not null,
  reconciliation_date timestamptz default now(),
  bank_balance numeric(14,2) default 0,
  ledger_balance numeric(14,2) default 0,
  variance numeric(14,2) default 0,
  reconciliation_status text default 'balanced'
);
