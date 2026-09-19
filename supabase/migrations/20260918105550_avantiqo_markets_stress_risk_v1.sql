begin;

alter table public.market_risk_policies
  add column if not exists max_portfolio_stress_loss_pct numeric(8,4) not null default 12,
  add column if not exists stress_market_shock_pct numeric(8,4) not null default 8,
  add column if not exists stress_sector_shock_pct numeric(8,4) not null default 12,
  add column if not exists stress_correlated_cluster_shock_pct numeric(8,4) not null default 15,
  add column if not exists stress_single_name_shock_pct numeric(8,4) not null default 20;

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_stress_loss_check;
alter table public.market_risk_policies
  add constraint market_risk_max_stress_loss_check
  check (max_portfolio_stress_loss_pct > 0 and max_portfolio_stress_loss_pct <= 100);

alter table public.market_risk_policies
  drop constraint if exists market_risk_market_shock_check;
alter table public.market_risk_policies
  add constraint market_risk_market_shock_check
  check (stress_market_shock_pct > 0 and stress_market_shock_pct <= 100);

alter table public.market_risk_policies
  drop constraint if exists market_risk_sector_shock_check;
alter table public.market_risk_policies
  add constraint market_risk_sector_shock_check
  check (stress_sector_shock_pct > 0 and stress_sector_shock_pct <= 100);

alter table public.market_risk_policies
  drop constraint if exists market_risk_cluster_shock_check;
alter table public.market_risk_policies
  add constraint market_risk_cluster_shock_check
  check (
    stress_correlated_cluster_shock_pct > 0
    and stress_correlated_cluster_shock_pct <= 100
  );

alter table public.market_risk_policies
  drop constraint if exists market_risk_single_name_shock_check;
alter table public.market_risk_policies
  add constraint market_risk_single_name_shock_check
  check (stress_single_name_shock_pct > 0 and stress_single_name_shock_pct <= 100);

comment on column public.market_risk_policies.max_portfolio_stress_loss_pct is
  'Maximum projected deterministic PAPER stress loss as a percentage of portfolio equity for new BUY exposure.';
comment on column public.market_risk_policies.stress_market_shock_pct is
  'Broad-market deterministic adverse shock used by the PAPER portfolio stress gate.';
comment on column public.market_risk_policies.stress_sector_shock_pct is
  'Candidate-sector deterministic adverse shock used by the PAPER portfolio stress gate.';
comment on column public.market_risk_policies.stress_correlated_cluster_shock_pct is
  'Correlated-cluster deterministic adverse shock used by the PAPER portfolio stress gate.';
comment on column public.market_risk_policies.stress_single_name_shock_pct is
  'Candidate single-name deterministic adverse gap shock used by the PAPER portfolio stress gate.';

commit;
