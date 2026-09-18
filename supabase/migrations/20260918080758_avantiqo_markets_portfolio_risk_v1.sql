begin;

alter table public.market_risk_policies
  add column if not exists max_gross_exposure_pct numeric(8,4) not null default 100,
  add column if not exists max_correlated_exposure_pct numeric(8,4) not null default 35,
  add column if not exists correlation_threshold numeric(7,4) not null default 0.80;

alter table public.market_risk_policies drop constraint if exists market_risk_gross_exposure_check;
alter table public.market_risk_policies add constraint market_risk_gross_exposure_check
  check (max_gross_exposure_pct > 0 and max_gross_exposure_pct <= 300);

alter table public.market_risk_policies drop constraint if exists market_risk_correlated_exposure_check;
alter table public.market_risk_policies add constraint market_risk_correlated_exposure_check
  check (max_correlated_exposure_pct > 0 and max_correlated_exposure_pct <= 100);

alter table public.market_risk_policies drop constraint if exists market_risk_correlation_threshold_check;
alter table public.market_risk_policies add constraint market_risk_correlation_threshold_check
  check (correlation_threshold >= 0 and correlation_threshold <= 1);

comment on column public.market_risk_policies.max_gross_exposure_pct is
  'Maximum absolute paper portfolio market value as a percentage of equity.';
comment on column public.market_risk_policies.max_correlated_exposure_pct is
  'Maximum combined exposure to positions whose observed returns correlate above correlation_threshold with the proposed instrument.';
comment on column public.market_risk_policies.correlation_threshold is
  'Observed return-correlation threshold used for deterministic paper portfolio concentration control.';

commit;
