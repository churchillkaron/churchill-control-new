create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  budget_name text not null,
  fiscal_year integer not null,
  status text default 'draft',
  created_at timestamptz default now()
);

create table if not exists budget_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  budget_id uuid not null,
  account_id uuid not null,
  monthly_amount numeric(14,2) default 0,
  annual_amount numeric(14,2) default 0,
  created_at timestamptz default now()
);
