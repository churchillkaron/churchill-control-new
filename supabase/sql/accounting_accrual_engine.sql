create table if not exists accounting_accrual_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  accrual_type text not null,
  reference_type text,
  reference_id text,
  debit_account text not null,
  credit_account text not null,
  amount numeric(14,2) default 0,
  accrual_date date not null,
  reversal_date date,
  accrual_status text default 'posted',
  created_at timestamptz default now()
);

create table if not exists deferred_revenue_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_name text,
  contract_reference text,
  total_contract_value numeric(14,2) default 0,
  recognized_amount numeric(14,2) default 0,
  remaining_balance numeric(14,2) default 0,
  recognition_status text default 'active',
  created_at timestamptz default now()
);

create table if not exists accounting_period_locks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  accounting_period text not null,
  locked boolean default false,
  locked_by text,
  locked_at timestamptz,
  reopened_by text,
  reopened_at timestamptz,
  created_at timestamptz default now()
);
