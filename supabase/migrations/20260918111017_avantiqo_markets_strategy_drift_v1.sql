begin;

alter table public.market_automation_policies
  add column if not exists require_strategy_health_gate boolean not null default true,
  add column if not exists strategy_health_min_samples integer not null default 20,
  add column if not exists strategy_health_max_brier numeric(8,6) not null default 0.30,
  add column if not exists strategy_health_max_log_loss numeric(8,6) not null default 0.90,
  add column if not exists strategy_health_min_directional_hit_rate numeric(8,6) not null default 0.45,
  add column if not exists strategy_health_min_avg_excess_return numeric(10,6) not null default -0.01;

alter table public.market_automation_policies
  drop constraint if exists market_automation_strategy_health_samples_check;
alter table public.market_automation_policies
  add constraint market_automation_strategy_health_samples_check
  check (strategy_health_min_samples between 5 and 500);

alter table public.market_automation_policies
  drop constraint if exists market_automation_strategy_health_brier_check;
alter table public.market_automation_policies
  add constraint market_automation_strategy_health_brier_check
  check (strategy_health_max_brier > 0 and strategy_health_max_brier <= 1);

alter table public.market_automation_policies
  drop constraint if exists market_automation_strategy_health_log_loss_check;
alter table public.market_automation_policies
  add constraint market_automation_strategy_health_log_loss_check
  check (strategy_health_max_log_loss > 0 and strategy_health_max_log_loss <= 10);

alter table public.market_automation_policies
  drop constraint if exists market_automation_strategy_health_hit_rate_check;
alter table public.market_automation_policies
  add constraint market_automation_strategy_health_hit_rate_check
  check (
    strategy_health_min_directional_hit_rate >= 0
    and strategy_health_min_directional_hit_rate <= 1
  );

alter table public.market_automation_policies
  drop constraint if exists market_automation_strategy_health_excess_return_check;
alter table public.market_automation_policies
  add constraint market_automation_strategy_health_excess_return_check
  check (
    strategy_health_min_avg_excess_return >= -1
    and strategy_health_min_avg_excess_return <= 1
  );

comment on column public.market_automation_policies.require_strategy_health_gate is
  'When true, autonomous PAPER BUYs require recent realized prediction quality to remain inside owner thresholds once sufficient mature outcomes exist.';
comment on column public.market_automation_policies.strategy_health_min_samples is
  'Minimum number of mature prediction outcomes before the PAPER strategy-health drift gate can block new BUY exposure.';

commit;
