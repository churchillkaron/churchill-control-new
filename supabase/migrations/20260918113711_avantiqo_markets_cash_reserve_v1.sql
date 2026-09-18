begin;

alter table public.market_risk_policies
  add column if not exists min_cash_reserve_pct numeric(8,4) not null default 10,
  add column if not exists cash_reserve_execution_buffer_bps numeric(10,4) not null default 25;

alter table public.market_risk_policies
  drop constraint if exists market_risk_min_cash_reserve_check;
alter table public.market_risk_policies
  add constraint market_risk_min_cash_reserve_check
  check (min_cash_reserve_pct >= 0 and min_cash_reserve_pct <= 100);

alter table public.market_risk_policies
  drop constraint if exists market_risk_cash_reserve_buffer_check;
alter table public.market_risk_policies
  add constraint market_risk_cash_reserve_buffer_check
  check (
    cash_reserve_execution_buffer_bps >= 0
    and cash_reserve_execution_buffer_bps <= 10000
  );

comment on column public.market_risk_policies.min_cash_reserve_pct is
  'Minimum PAPER cash balance retained as a percentage of portfolio equity after any new BUY.';
comment on column public.market_risk_policies.cash_reserve_execution_buffer_bps is
  'Additional adverse execution-cost buffer applied to proposed PAPER BUY notional before testing the cash reserve.';

commit;
