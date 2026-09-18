begin;

create table if not exists public.market_portfolios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  name text not null,
  base_currency text not null default 'USD',
  execution_mode text not null default 'PAPER',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_portfolios_execution_mode_check check (execution_mode in ('PAPER','LIVE_DISABLED')),
  constraint market_portfolios_status_check check (status in ('ACTIVE','PAUSED','ARCHIVED'))
);

create index if not exists market_portfolios_scope_idx
  on public.market_portfolios (organization_id, entity_id, status, updated_at desc);

create table if not exists public.market_watchlist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  symbol text not null,
  exchange text,
  asset_type text not null default 'EQUITY',
  thesis_horizon text not null default 'MEDIUM',
  status text not null default 'ACTIVE',
  added_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint market_watchlist_asset_type_check check (asset_type in ('EQUITY','ETF','INDEX','FX','CRYPTO','COMMODITY')),
  constraint market_watchlist_horizon_check check (thesis_horizon in ('INTRADAY','SHORT','MEDIUM','LONG')),
  constraint market_watchlist_status_check check (status in ('ACTIVE','PAUSED','REMOVED'))
);

create unique index if not exists market_watchlist_symbol_unique
  on public.market_watchlist (portfolio_id, upper(symbol))
  where status <> 'REMOVED';
create table if not exists public.market_evidence_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid references public.market_portfolios(id) on delete cascade,
  symbol text,
  evidence_type text not null,
  source_name text not null,
  source_uri text,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  freshness_seconds integer,
  materiality numeric(7,4),
  sentiment numeric(7,4),
  payload jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  constraint market_evidence_materiality_check check (materiality is null or (materiality >= 0 and materiality <= 1)),
  constraint market_evidence_sentiment_check check (sentiment is null or (sentiment >= -1 and sentiment <= 1))
);

create index if not exists market_evidence_scope_idx
  on public.market_evidence_events (organization_id, portfolio_id, symbol, observed_at desc);

create table if not exists public.market_agent_theses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  symbol text not null,
  agent_type text not null,
  horizon text not null,
  stance text not null,
  confidence numeric(7,4) not null,
  expected_return numeric(12,6),
  downside_risk numeric(12,6),
  evidence_ids uuid[] not null default '{}',
  rationale jsonb not null default '{}'::jsonb,
  model_version text,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint market_agent_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint market_agent_stance_check check (stance in ('BULLISH','BEARISH','NEUTRAL','INSUFFICIENT_EVIDENCE'))
);
create table if not exists public.market_risk_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  max_position_pct numeric(8,4) not null default 10,
  max_sector_pct numeric(8,4) not null default 30,
  max_daily_loss_pct numeric(8,4) not null default 2,
  max_portfolio_drawdown_pct numeric(8,4) not null default 10,
  min_decision_confidence numeric(7,4) not null default 0.70,
  max_order_notional numeric(20,4),
  live_execution_enabled boolean not null default false,
  require_human_approval boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint market_risk_confidence_check check (min_decision_confidence >= 0 and min_decision_confidence <= 1),
  constraint market_risk_live_guard check (live_execution_enabled = false)
);

create unique index if not exists market_risk_policy_portfolio_unique
  on public.market_risk_policies (portfolio_id);

create table if not exists public.market_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  symbol text not null,
  horizon text not null,
  action text not null,
  confidence numeric(7,4) not null,
  expected_return numeric(12,6),
  downside_risk numeric(12,6),
  evidence_ids uuid[] not null default '{}',
  thesis_ids uuid[] not null default '{}',
  risk_status text not null default 'PENDING',
  risk_reasons jsonb not null default '[]'::jsonb,
  decision_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint market_decision_action_check check (action in ('BUY','SELL','HOLD','NO_ACTION')),
  constraint market_decision_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint market_decision_risk_status_check check (risk_status in ('PENDING','APPROVED_PAPER','REJECTED','EXPIRED'))
);

create index if not exists market_decisions_scope_idx
  on public.market_decisions (organization_id, portfolio_id, created_at desc);
create table if not exists public.market_paper_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  decision_id uuid references public.market_decisions(id) on delete restrict,
  symbol text not null,
  side text not null,
  order_type text not null default 'MARKET',
  quantity numeric(24,8) not null,
  limit_price numeric(24,8),
  requested_price numeric(24,8),
  filled_price numeric(24,8),
  status text not null default 'QUEUED',
  risk_snapshot jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  filled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint market_paper_order_side_check check (side in ('BUY','SELL')),
  constraint market_paper_order_type_check check (order_type in ('MARKET','LIMIT')),
  constraint market_paper_order_status_check check (status in ('QUEUED','FILLED','REJECTED','CANCELLED')),
  constraint market_paper_order_quantity_check check (quantity > 0)
);

create index if not exists market_paper_orders_scope_idx
  on public.market_paper_orders (organization_id, portfolio_id, submitted_at desc);

alter table public.market_portfolios enable row level security;
alter table public.market_watchlist enable row level security;
alter table public.market_evidence_events enable row level security;
alter table public.market_agent_theses enable row level security;
alter table public.market_risk_policies enable row level security;
alter table public.market_decisions enable row level security;
alter table public.market_paper_orders enable row level security;

comment on table public.market_decisions is
  'Governed Avantiqo Markets decision ledger. Predictions are probabilistic evidence, not guaranteed outcomes.';
comment on table public.market_paper_orders is
  'Simulation-only orders for Avantiqo Markets v1. No broker execution path exists in this migration.';
do $$
declare
  v_template_id uuid;
begin
  select id into v_template_id
  from public.workspace_templates
  where lower(btrim(industry)) = 'markets'
  order by created_at nulls last, id
  limit 1;

  if v_template_id is null then
    insert into public.workspace_templates (
      name, industry, description, solution_version, status, route, metadata
    ) values (
      'Avantiqo Markets',
      'markets',
      'Portfolio intelligence, market research, governed probabilistic decisions, risk controls and paper trading.',
      '1.0',
      'ACTIVE',
      '/solutions/markets',
      '{"execution_mode":"PAPER","live_execution":false}'::jsonb
    );
  else
    update public.workspace_templates
    set name = 'Avantiqo Markets',
        description = 'Portfolio intelligence, market research, governed probabilistic decisions, risk controls and paper trading.',
        solution_version = '1.0',
        status = 'ACTIVE',
        route = '/solutions/markets',
        metadata = coalesce(metadata, '{}'::jsonb) || '{"execution_mode":"PAPER","live_execution":false}'::jsonb
    where id = v_template_id;
  end if;
end;
$$;

commit;