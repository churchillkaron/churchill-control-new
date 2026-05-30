create table if not exists currency_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  base_currency text not null,
  target_currency text not null,
  exchange_rate numeric(18,8) not null,
  effective_date date not null,
  created_at timestamptz default now()
);

create table if not exists currency_revaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id text,
  base_currency text,
  target_currency text,
  old_value numeric(14,2),
  new_value numeric(14,2),
  gain_loss numeric(14,2),
  created_at timestamptz default now()
);

create table if not exists compliance_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  module text,
  check_name text,
  status text,
  notes text,
  created_at timestamptz default now()
);
