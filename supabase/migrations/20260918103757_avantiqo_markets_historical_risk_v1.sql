begin;

alter table public.market_risk_policies
  add column if not exists historical_risk_min_observations integer not null default 60,
  add column if not exists max_portfolio_var_95_pct numeric(8,4) not null default 5,
  add column if not exists max_portfolio_expected_shortfall_95_pct numeric(8,4) not null default 8,
  add column if not exists max_position_annualized_volatility_pct numeric(8,4) not null default 100;

alter table public.market_risk_policies
  drop constraint if exists market_risk_history_observation_check;
alter table public.market_risk_policies
  add constraint market_risk_history_observation_check
  check (historical_risk_min_observations between 20 and 504);

alter table public.market_risk_policies
  drop constraint if exists market_risk_var95_check;
alter table public.market_risk_policies
  add constraint market_risk_var95_check
  check (max_portfolio_var_95_pct > 0 and max_portfolio_var_95_pct <= 100);

alter table public.market_risk_policies
  drop constraint if exists market_risk_es95_check;
alter table public.market_risk_policies
  add constraint market_risk_es95_check
  check (
    max_portfolio_expected_shortfall_95_pct > 0
    and max_portfolio_expected_shortfall_95_pct <= 100
  );

alter table public.market_risk_policies
  drop constraint if exists market_risk_position_volatility_check;
alter table public.market_risk_policies
  add constraint market_risk_position_volatility_check
  check (
    max_position_annualized_volatility_pct > 0
    and max_position_annualized_volatility_pct <= 1000
  );

comment on column public.market_risk_policies.historical_risk_min_observations is
  'Minimum trailing daily-return observations required before new PAPER BUY exposure can pass historical distribution risk.';
comment on column public.market_risk_policies.max_portfolio_var_95_pct is
  'Maximum projected one-day 95% historical Value-at-Risk as a percentage of portfolio equity for new PAPER BUY exposure.';
comment on column public.market_risk_policies.max_portfolio_expected_shortfall_95_pct is
  'Maximum projected one-day 95% historical Expected Shortfall as a percentage of portfolio equity for new PAPER BUY exposure.';
comment on column public.market_risk_policies.max_position_annualized_volatility_pct is
  'Maximum candidate annualized historical volatility percentage for new PAPER BUY exposure.';

commit;
