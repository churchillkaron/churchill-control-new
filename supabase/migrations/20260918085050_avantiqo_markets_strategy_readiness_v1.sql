begin;

alter table public.market_automation_policies
  add column if not exists require_walk_forward_validation boolean not null default true,
  add column if not exists validation_max_age_hours integer not null default 168,
  add column if not exists validation_min_trades integer not null default 5,
  add column if not exists validation_min_directional_hit_rate numeric(7,4) not null default 0.50,
  add column if not exists validation_max_drawdown_pct numeric(8,4) not null default 25,
  add column if not exists validation_min_total_return numeric(12,6) not null default 0;

alter table public.market_automation_policies drop constraint if exists market_automation_validation_age_check;
alter table public.market_automation_policies add constraint market_automation_validation_age_check
  check (validation_max_age_hours between 1 and 8760);

alter table public.market_automation_policies drop constraint if exists market_automation_validation_trade_count_check;
alter table public.market_automation_policies add constraint market_automation_validation_trade_count_check
  check (validation_min_trades between 0 and 10000);

alter table public.market_automation_policies drop constraint if exists market_automation_validation_hit_rate_check;
alter table public.market_automation_policies add constraint market_automation_validation_hit_rate_check
  check (validation_min_directional_hit_rate >= 0 and validation_min_directional_hit_rate <= 1);

alter table public.market_automation_policies drop constraint if exists market_automation_validation_drawdown_check;
alter table public.market_automation_policies add constraint market_automation_validation_drawdown_check
  check (validation_max_drawdown_pct >= 0 and validation_max_drawdown_pct <= 100);

comment on column public.market_automation_policies.require_walk_forward_validation is
  'When true, autonomous PAPER BUYs require a fresh completed walk-forward run that meets the configured evidence thresholds.';
comment on column public.market_automation_policies.validation_min_total_return is
  'Minimum out-of-sample total return required for autonomous PAPER BUY readiness. This setting never grants live execution authority.';

commit;
