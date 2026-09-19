begin;

alter table public.market_evidence_events
  add column if not exists provider_event_id text;

create unique index if not exists market_evidence_provider_event_unique
  on public.market_evidence_events (organization_id, portfolio_id, source_name, provider_event_id)
  where provider_event_id is not null;

create table if not exists public.market_instruments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  symbol text not null,
  exchange text,
  asset_type text not null default 'EQUITY',
  currency text not null default 'USD',
  provider_symbol text,
  cik text,
  name text,
  sector text,
  industry text,
  status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_instruments_asset_type_check check (asset_type in ('EQUITY','ETF','INDEX','FX','CRYPTO','COMMODITY')),
  constraint market_instruments_status_check check (status in ('ACTIVE','INACTIVE','DELISTED'))
);

create unique index if not exists market_instruments_org_symbol_unique
  on public.market_instruments (organization_id, upper(symbol));

create index if not exists market_instruments_cik_idx
  on public.market_instruments (cik)
  where cik is not null;

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid references public.market_portfolios(id) on delete cascade,
  instrument_id uuid references public.market_instruments(id) on delete cascade,
  symbol text not null,
  provider text not null,
  feed text,
  captured_at timestamptz not null,
  latest_trade_price numeric(24,8),
  latest_trade_size numeric(24,8),
  bid_price numeric(24,8),
  bid_size numeric(24,8),
  ask_price numeric(24,8),
  ask_size numeric(24,8),
  minute_open numeric(24,8),
  minute_high numeric(24,8),
  minute_low numeric(24,8),
  minute_close numeric(24,8),
  minute_volume numeric(24,8),
  day_open numeric(24,8),
  day_high numeric(24,8),
  day_low numeric(24,8),
  day_close numeric(24,8),
  day_volume numeric(24,8),
  previous_close numeric(24,8),
  raw_payload jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists market_snapshots_symbol_time_idx
  on public.market_snapshots (organization_id, symbol, captured_at desc);

create table if not exists public.market_bars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid references public.market_portfolios(id) on delete cascade,
  instrument_id uuid references public.market_instruments(id) on delete cascade,
  symbol text not null,
  provider text not null,
  timeframe text not null,
  bar_time timestamptz not null,
  open numeric(24,8) not null,
  high numeric(24,8) not null,
  low numeric(24,8) not null,
  close numeric(24,8) not null,
  volume numeric(24,8),
  trade_count bigint,
  vwap numeric(24,8),
  feed text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists market_bars_unique_point
  on public.market_bars (organization_id, symbol, provider, timeframe, bar_time);

create index if not exists market_bars_symbol_time_idx
  on public.market_bars (organization_id, symbol, timeframe, bar_time desc);

create table if not exists public.market_filings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid references public.market_portfolios(id) on delete cascade,
  instrument_id uuid references public.market_instruments(id) on delete cascade,
  symbol text,
  cik text,
  provider text not null default 'sec_edgar',
  accession_number text not null,
  form_type text not null,
  filed_at date,
  accepted_at timestamptz,
  report_date date,
  primary_document text,
  filing_url text,
  description text,
  payload jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists market_filings_accession_unique
  on public.market_filings (organization_id, accession_number);

create index if not exists market_filings_symbol_date_idx
  on public.market_filings (organization_id, symbol, filed_at desc);

create table if not exists public.market_prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  decision_id uuid not null references public.market_decisions(id) on delete cascade,
  symbol text not null,
  horizon text not null,
  prediction_time timestamptz not null,
  evaluation_time timestamptz not null,
  entry_price numeric(24,8),
  observed_price numeric(24,8),
  predicted_direction text,
  realized_return numeric(16,8),
  directional_hit boolean,
  squared_error numeric(18,10),
  log_loss numeric(18,10),
  benchmark_return numeric(16,8),
  excess_return numeric(16,8),
  outcome_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint market_prediction_direction_check
    check (predicted_direction in ('UP','DOWN','FLAT','UNKNOWN'))
);

create unique index if not exists market_prediction_outcome_unique
  on public.market_prediction_outcomes (decision_id, horizon, evaluation_time);

create index if not exists market_prediction_outcomes_scope_idx
  on public.market_prediction_outcomes (organization_id, portfolio_id, symbol, evaluation_time desc);

alter table public.market_instruments enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.market_bars enable row level security;
alter table public.market_filings enable row level security;
alter table public.market_prediction_outcomes enable row level security;

comment on table public.market_prediction_outcomes is
  'Observed outcomes for governed market decisions, used for calibration and performance evaluation rather than guaranteed prediction claims.';

commit;
