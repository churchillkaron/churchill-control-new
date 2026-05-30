create table if not exists accounting_control_totals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  control_type text not null,
  ledger_balance numeric(14,2) default 0,
  subledger_balance numeric(14,2) default 0,
  variance numeric(14,2) default 0,
  status text default 'balanced',
  created_at timestamptz default now()
);
