create table if not exists consolidation_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  target_currency text not null,
  exchange_rate numeric(18,8) not null,
  effective_date timestamptz default now()
);

create table if not exists consolidation_eliminations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  elimination_type text not null,
  source_entity text not null,
  target_entity text not null,
  elimination_amount numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists consolidation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  consolidation_period text not null,
  total_entities integer default 0,
  consolidated_revenue numeric(14,2) default 0,
  consolidated_profit numeric(14,2) default 0,
  fx_adjustment numeric(14,2) default 0,
  created_at timestamptz default now()
);
