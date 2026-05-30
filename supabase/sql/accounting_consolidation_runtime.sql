create table if not exists consolidation_runs (
  id uuid primary key default gen_random_uuid(),
  parent_tenant_id uuid not null,
  reporting_period text not null,
  total_assets numeric(14,2) default 0,
  total_liabilities numeric(14,2) default 0,
  total_equity numeric(14,2) default 0,
  total_revenue numeric(14,2) default 0,
  total_expenses numeric(14,2) default 0,
  total_profit numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists foreign_currency_translation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_currency text not null,
  target_currency text not null,
  exchange_rate numeric(14,6) default 1,
  translated_amount numeric(14,2) default 0,
  created_at timestamptz default now()
);
