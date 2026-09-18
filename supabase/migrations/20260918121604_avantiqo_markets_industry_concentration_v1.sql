begin;

alter table public.market_risk_policies
  add column if not exists max_industry_pct numeric(8,4) not null default 20;

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_industry_check;
alter table public.market_risk_policies
  add constraint market_risk_max_industry_check
  check (max_industry_pct > 0 and max_industry_pct <= 100);

comment on column public.market_risk_policies.max_industry_pct is
  'Maximum projected PAPER exposure to the candidate instrument industry as a percentage of portfolio equity.';

commit;
