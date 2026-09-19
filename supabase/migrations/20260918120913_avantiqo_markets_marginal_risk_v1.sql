begin;

alter table public.market_risk_policies
  add column if not exists max_incremental_var_95_pct numeric(8,4) not null default 1.5,
  add column if not exists max_incremental_expected_shortfall_95_pct numeric(8,4) not null default 2.5;

alter table public.market_risk_policies
  drop constraint if exists market_risk_incremental_var_check;
alter table public.market_risk_policies
  add constraint market_risk_incremental_var_check
  check (max_incremental_var_95_pct > 0 and max_incremental_var_95_pct <= 100);

alter table public.market_risk_policies
  drop constraint if exists market_risk_incremental_es_check;
alter table public.market_risk_policies
  add constraint market_risk_incremental_es_check
  check (
    max_incremental_expected_shortfall_95_pct > 0
    and max_incremental_expected_shortfall_95_pct <= 100
  );

commit;
