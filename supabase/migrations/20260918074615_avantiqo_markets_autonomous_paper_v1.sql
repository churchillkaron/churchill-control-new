begin;

create table if not exists public.market_automation_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  auto_paper_enabled boolean not null default false,
  cycle_interval_seconds integer not null default 300,
  target_position_pct numeric(8,4) not null default 2,
  min_confidence numeric(7,4) not null default 0.75,
  max_trades_per_cycle integer not null default 3,
  cooldown_minutes integer not null default 60,
  allow_buys boolean not null default true,
  allow_sells boolean not null default true,
  kill_switch boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint market_automation_cycle_interval_check check (cycle_interval_seconds between 60 and 86400),
  constraint market_automation_target_position_check check (target_position_pct > 0 and target_position_pct <= 10),
  constraint market_automation_confidence_check check (min_confidence >= 0 and min_confidence <= 1),
  constraint market_automation_trade_count_check check (max_trades_per_cycle between 1 and 20),
  constraint market_automation_cooldown_check check (cooldown_minutes between 0 and 10080)
);

create unique index if not exists market_automation_policy_portfolio_unique
  on public.market_automation_policies (portfolio_id);

create table if not exists public.market_automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'RUNNING',
  symbols_considered integer not null default 0,
  decisions_created integer not null default 0,
  orders_created integer not null default 0,
  orders_filled integer not null default 0,
  outcomes_scored integer not null default 0,
  skipped jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  constraint market_automation_run_status_check check (status in ('RUNNING','COMPLETED','SKIPPED','FAILED'))
);

create index if not exists market_automation_runs_scope_idx
  on public.market_automation_runs (organization_id, portfolio_id, started_at desc);

alter table public.market_automation_policies enable row level security;
alter table public.market_automation_runs enable row level security;

comment on table public.market_automation_policies is
  'Paper-only autonomous trading authority. auto_paper_enabled does not grant live brokerage authority.';
comment on table public.market_automation_runs is
  'Durable audit record for each autonomous Avantiqo Markets paper cycle.';

commit;
