begin;

alter table public.market_risk_policies
  add column if not exists max_daily_bar_age_hours numeric(10,4) not null default 120;

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_daily_bar_age_check;
alter table public.market_risk_policies
  add constraint market_risk_max_daily_bar_age_check
  check (max_daily_bar_age_hours >= 24 and max_daily_bar_age_hours <= 720);

comment on column public.market_risk_policies.max_daily_bar_age_hours is
  'Maximum permitted age of required daily market bars for new PAPER BUY exposure. SELL de-risking remains available with stale evidence.';

commit;
