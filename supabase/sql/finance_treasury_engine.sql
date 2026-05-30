create table if not exists cash_flow_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  inflow numeric(14,2) default 0,
  outflow numeric(14,2) default 0,
  net_cash_flow numeric(14,2) default 0,
  cash_position numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists treasury_liquidity_analysis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  available_cash numeric(14,2) default 0,
  short_term_liabilities numeric(14,2) default 0,
  liquidity_ratio numeric(14,2) default 0,
  liquidity_status text default 'healthy',
  created_at timestamptz default now()
);

create table if not exists payment_priority_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vendor_name text,
  invoice_reference text,
  payment_amount numeric(14,2) default 0,
  payment_priority text default 'medium',
  due_date date,
  payment_status text default 'pending',
  created_at timestamptz default now()
);
