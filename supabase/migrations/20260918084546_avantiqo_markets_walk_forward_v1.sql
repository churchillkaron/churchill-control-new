begin;

create table if not exists public.market_backtest_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  symbol text not null,
  strategy_key text not null,
  status text not null default 'RUNNING',
  data_start date,
  data_end date,
  training_bars integer not null,
  test_bars integer not null,
  transaction_cost_bps numeric(10,4) not null default 10,
  initial_equity numeric(20,4) not null default 100000,
  final_equity numeric(20,4),
  total_return numeric(16,8),
  max_drawdown_pct numeric(12,6),
  trade_count integer not null default 0,
  directional_hit_rate numeric(12,6),
  summary jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint market_backtest_status_check check (status in ('RUNNING','COMPLETED','FAILED')),
  constraint market_backtest_training_bars_check check (training_bars >= 20),
  constraint market_backtest_test_bars_check check (test_bars >= 1),
  constraint market_backtest_cost_check check (transaction_cost_bps >= 0),
  constraint market_backtest_initial_equity_check check (initial_equity > 0)
);

create index if not exists market_backtest_runs_scope_idx
  on public.market_backtest_runs (organization_id, portfolio_id, symbol, started_at desc);

create table if not exists public.market_backtest_folds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  run_id uuid not null references public.market_backtest_runs(id) on delete cascade,
  symbol text not null,
  fold_index integer not null,
  train_start date not null,
  train_end date not null,
  test_start date not null,
  test_end date not null,
  starting_equity numeric(20,4) not null,
  ending_equity numeric(20,4) not null,
  fold_return numeric(16,8),
  max_drawdown_pct numeric(12,6),
  trade_count integer not null default 0,
  directional_hits integer not null default 0,
  directional_tests integer not null default 0,
  turnover numeric(20,8) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint market_backtest_fold_index_check check (fold_index >= 0)
);

create unique index if not exists market_backtest_fold_unique
  on public.market_backtest_folds (run_id, fold_index);

alter table public.market_backtest_runs enable row level security;
alter table public.market_backtest_folds enable row level security;

comment on table public.market_backtest_runs is
  'Point-in-time walk-forward validation for Avantiqo Markets strategies. Historical evidence only; no authority increase is implied.';
comment on table public.market_backtest_folds is
  'Durable out-of-sample fold metrics for a Markets walk-forward run.';

commit;
