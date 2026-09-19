begin;

alter table public.market_risk_policies
  add column if not exists max_rolling_24h_turnover_pct numeric(10,4) not null default 100,
  add column if not exists max_rolling_24h_execution_cost_pct_equity numeric(10,6) not null default 0.25;

alter table public.market_risk_policies
  drop constraint if exists market_risk_rolling_turnover_check;
alter table public.market_risk_policies
  add constraint market_risk_rolling_turnover_check
  check (max_rolling_24h_turnover_pct > 0 and max_rolling_24h_turnover_pct <= 1000);

alter table public.market_risk_policies
  drop constraint if exists market_risk_rolling_execution_cost_check;
alter table public.market_risk_policies
  add constraint market_risk_rolling_execution_cost_check
  check (
    max_rolling_24h_execution_cost_pct_equity > 0
    and max_rolling_24h_execution_cost_pct_equity <= 10
  );

comment on column public.market_risk_policies.max_rolling_24h_turnover_pct is
  'Maximum rolling 24-hour filled plus proposed BUY notional as a percentage of PAPER portfolio equity.';
comment on column public.market_risk_policies.max_rolling_24h_execution_cost_pct_equity is
  'Maximum rolling 24-hour realized PAPER execution-cost leakage as a percentage of portfolio equity before new BUY exposure is blocked.';

commit;
