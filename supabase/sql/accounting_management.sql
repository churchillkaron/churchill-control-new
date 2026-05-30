create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  budget_name text not null,
  fiscal_year integer not null,
  department text,
  amount numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid references budgets(id) on delete cascade,
  tenant_id uuid not null,
  account_code text,
  account_name text,
  monthly_amount numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists organization_accounting_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  organization_name text not null,
  base_currency text default 'THB',
  fiscal_year_start integer default 1,
  consolidation_enabled boolean default false,
  created_at timestamptz default now()
);
