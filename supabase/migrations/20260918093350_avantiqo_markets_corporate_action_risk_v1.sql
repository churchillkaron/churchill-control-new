begin;

create table if not exists public.market_corporate_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  symbol text not null,
  provider text not null default 'alpaca',
  provider_action_id text not null,
  action_type text not null,
  process_date date,
  event_date date,
  ex_date date,
  record_date date,
  payable_date date,
  declaration_date date,
  currency text,
  data_quality text not null default 'complete',
  raw_payload jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_corporate_action_quality_check check (data_quality in ('complete','all'))
);

create unique index if not exists market_corporate_actions_provider_unique
  on public.market_corporate_actions (
    organization_id,
    portfolio_id,
    provider,
    provider_action_id
  );

create index if not exists market_corporate_actions_symbol_event_idx
  on public.market_corporate_actions (
    organization_id,
    portfolio_id,
    symbol,
    event_date
  );

alter table public.market_corporate_actions enable row level security;

alter table public.market_risk_policies
  add column if not exists block_corporate_action_buys boolean not null default true,
  add column if not exists corporate_action_blackout_days_before integer not null default 3,
  add column if not exists corporate_action_blackout_days_after integer not null default 1;

alter table public.market_risk_policies drop constraint if exists market_risk_corporate_action_before_check;
alter table public.market_risk_policies add constraint market_risk_corporate_action_before_check
  check (corporate_action_blackout_days_before between 0 and 30);

alter table public.market_risk_policies drop constraint if exists market_risk_corporate_action_after_check;
alter table public.market_risk_policies add constraint market_risk_corporate_action_after_check
  check (corporate_action_blackout_days_after between 0 and 30);

comment on table public.market_corporate_actions is
  'Normalized corporate-action evidence from market-data providers. Missing rows never prove that no event exists.';
comment on column public.market_risk_policies.block_corporate_action_buys is
  'When true, known material corporate actions can block new PAPER BUY exposure during the configured blackout window. SELL de-risking is unaffected.';

commit;
