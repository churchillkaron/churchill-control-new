create table if not exists reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  bank_account_id uuid,
  reconciliation_date date not null,
  matched_count integer default 0,
  unmatched_count integer default 0,
  status text default 'completed',
  created_at timestamptz default now()
);

create table if not exists reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  bank_transaction_id uuid,
  reason text,
  severity text,
  resolved boolean default false,
  created_at timestamptz default now()
);
