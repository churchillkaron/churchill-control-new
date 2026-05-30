create table if not exists intercompany_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  counterparty_tenant_id uuid not null,
  transaction_type text,
  reference text,
  amount numeric(14,2) default 0,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists period_closing_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  accounting_period_id uuid,
  closing_status text default 'completed',
  notes text,
  created_at timestamptz default now()
);

create table if not exists retained_earnings_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  fiscal_year integer,
  net_income numeric(14,2) default 0,
  closing_entry_id text,
  created_at timestamptz default now()
);
