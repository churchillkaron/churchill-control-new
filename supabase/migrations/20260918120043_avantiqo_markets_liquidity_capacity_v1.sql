begin;

alter table public.market_risk_policies
  add column if not exists liquidity_adv_window_days integer not null default 20,
  add column if not exists liquidity_min_observations integer not null default 15,
  add column if not exists max_position_adv_pct numeric(10,4) not null default 10,
  add column if not exists liquidation_participation_pct numeric(10,4) not null default 10,
  add column if not exists max_days_to_liquidate numeric(10,4) not null default 5;

alter table public.market_risk_policies
  drop constraint if exists market_risk_liquidity_adv_window_check;
alter table public.market_risk_policies
  add constraint market_risk_liquidity_adv_window_check
  check (liquidity_adv_window_days between 5 and 252);

alter table public.market_risk_policies
  drop constraint if exists market_risk_liquidity_min_observations_check;
alter table public.market_risk_policies
  add constraint market_risk_liquidity_min_observations_check
  check (liquidity_min_observations between 5 and 252);

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_position_adv_check;
alter table public.market_risk_policies
  add constraint market_risk_max_position_adv_check
  check (max_position_adv_pct > 0 and max_position_adv_pct <= 100);

alter table public.market_risk_policies
  drop constraint if exists market_risk_liquidation_participation_check;
alter table public.market_risk_policies
  add constraint market_risk_liquidation_participation_check
  check (liquidation_participation_pct > 0 and liquidation_participation_pct <= 100);

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_days_to_liquidate_check;
alter table public.market_risk_policies
  add constraint market_risk_max_days_to_liquidate_check
  check (max_days_to_liquidate > 0 and max_days_to_liquidate <= 60);

commit;
