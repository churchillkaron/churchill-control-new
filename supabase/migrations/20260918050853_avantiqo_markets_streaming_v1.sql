begin;

create table if not exists public.market_live_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  symbol text not null,
  provider text not null default 'alpaca',
  feed text not null default 'iex',
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
  raw_payload jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create unique index if not exists market_live_snapshots_portfolio_symbol_unique
  on public.market_live_snapshots (portfolio_id, symbol, provider, feed);

create index if not exists market_live_snapshots_org_symbol_idx
  on public.market_live_snapshots (organization_id, symbol, captured_at desc);

alter table public.market_live_snapshots enable row level security;

comment on table public.market_live_snapshots is
  'Latest coalesced streaming market state per portfolio/symbol. It is a read/risk input only and carries no broker authority.';

create table if not exists public.market_feed_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  provider text not null default 'alpaca',
  feed text not null default 'iex',
  connection_state text not null default 'DISCONNECTED',
  subscribed_symbols text[] not null default '{}',
  last_connected_at timestamptz,
  last_message_at timestamptz,
  last_flush_at timestamptz,
  reconnect_count integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint market_feed_status_connection_state_check
    check (connection_state in ('DISCONNECTED','CONNECTING','CONNECTED','DEGRADED','ERROR'))
);

create unique index if not exists market_feed_status_portfolio_provider_unique
  on public.market_feed_status (portfolio_id, provider, feed);

create index if not exists market_feed_status_org_updated_idx
  on public.market_feed_status (organization_id, updated_at desc);

alter table public.market_feed_status enable row level security;

comment on table public.market_feed_status is
  'Operational status for Avantiqo Markets streaming market/news data connections. This table carries no broker execution authority.';

commit;
