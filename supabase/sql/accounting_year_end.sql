create table if not exists year_end_closings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  accounting_period_id uuid not null,
  retained_earnings_amount numeric(14,2) default 0,
  closing_status text default 'completed',
  created_at timestamptz default now()
);
