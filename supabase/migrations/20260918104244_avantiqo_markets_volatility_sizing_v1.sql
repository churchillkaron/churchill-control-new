begin;

alter table public.market_automation_policies
  add column if not exists target_annualized_volatility_pct numeric(8,4) not null default 25;

alter table public.market_automation_policies
  drop constraint if exists market_automation_target_volatility_check;
alter table public.market_automation_policies
  add constraint market_automation_target_volatility_check
  check (
    target_annualized_volatility_pct > 0
    and target_annualized_volatility_pct <= 300
  );

comment on column public.market_automation_policies.target_annualized_volatility_pct is
  'Autonomous PAPER sizing target. Candidate position target percentage is scaled down when historical annualized volatility exceeds this value.';

commit;
