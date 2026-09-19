begin;

alter table public.market_risk_policies
  add column if not exists max_portfolio_beta numeric(10,6) not null default 1.5;

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_portfolio_beta_check;
alter table public.market_risk_policies
  add constraint market_risk_max_portfolio_beta_check
  check (max_portfolio_beta >= 0.1 and max_portfolio_beta <= 5);

comment on column public.market_risk_policies.max_portfolio_beta is
  'Maximum absolute projected PAPER portfolio beta relative to the configured portfolio benchmark for new BUY exposure.';

commit;
