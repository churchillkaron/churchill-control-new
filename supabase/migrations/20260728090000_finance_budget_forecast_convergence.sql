begin;

create table if not exists public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  period_id uuid not null,
  account_id uuid not null,
  category text,
  amount numeric(20,6) not null,
  month integer not null,
  year integer not null,
  currency_code text not null,
  status text not null default 'DRAFT',
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.finance_budgets
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists account_id uuid,
  add column if not exists category text,
  add column if not exists amount numeric(20,6),
  add column if not exists month integer,
  add column if not exists year integer,
  add column if not exists currency_code text,
  add column if not exists status text default 'DRAFT',
  add column if not exists idempotency_key text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists finance_budgets_idempotency_uidx
  on public.finance_budgets (organization_id, entity_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists finance_budgets_scope_idx
  on public.finance_budgets (organization_id, entity_id, period_id, account_id);

create table if not exists public.accounting_forecasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  period_id uuid,
  forecast_type text not null,
  forecast_period text not null,
  source_start_date date not null,
  source_end_date date not null,
  target_start_date date not null,
  target_end_date date not null,
  horizon_days integer not null,
  growth_rate_percent numeric(12,6) not null default 0,
  projected_amount numeric(20,6) not null,
  currency_code text not null,
  method text not null,
  inputs_json jsonb not null default '{}'::jsonb,
  status text not null default 'GENERATED',
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.accounting_forecasts
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists forecast_type text,
  add column if not exists forecast_period text,
  add column if not exists source_start_date date,
  add column if not exists source_end_date date,
  add column if not exists target_start_date date,
  add column if not exists target_end_date date,
  add column if not exists horizon_days integer,
  add column if not exists growth_rate_percent numeric(12,6) default 0,
  add column if not exists projected_amount numeric(20,6),
  add column if not exists currency_code text,
  add column if not exists method text,
  add column if not exists inputs_json jsonb default '{}'::jsonb,
  add column if not exists status text default 'GENERATED',
  add column if not exists idempotency_key text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists accounting_forecasts_idempotency_uidx
  on public.accounting_forecasts (organization_id, entity_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists accounting_forecasts_scope_idx
  on public.accounting_forecasts (organization_id, entity_id, period_id, created_at desc);

notify pgrst, 'reload schema';

commit;
