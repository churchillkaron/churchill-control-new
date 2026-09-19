begin;

create table if not exists public.market_agent_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  decision_id uuid not null references public.market_decisions(id) on delete cascade,
  thesis_id uuid not null references public.market_agent_theses(id) on delete cascade,
  symbol text not null,
  agent_type text not null,
  stance text not null,
  thesis_confidence numeric(7,6) not null,
  prediction_time timestamptz not null,
  evaluation_time timestamptz not null,
  realized_return numeric(16,8) not null,
  directional_hit boolean,
  probability_up numeric(7,6) not null,
  squared_error numeric(16,10) not null,
  log_loss numeric(16,10) not null,
  signed_return numeric(16,8),
  created_at timestamptz not null default now(),
  constraint market_agent_outcome_confidence_check check (thesis_confidence >= 0 and thesis_confidence <= 1),
  constraint market_agent_outcome_probability_check check (probability_up >= 0 and probability_up <= 1),
  constraint market_agent_outcome_stance_check check (stance in ('BULLISH','BEARISH','NEUTRAL'))
);

create unique index if not exists market_agent_outcome_unique
  on public.market_agent_outcomes (decision_id, thesis_id);
create index if not exists market_agent_outcome_scope_idx
  on public.market_agent_outcomes (organization_id, portfolio_id, agent_type, evaluation_time desc);

create table if not exists public.market_agent_performance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  agent_type text not null,
  sample_count integer not null default 0,
  directional_tests integer not null default 0,
  directional_hit_rate numeric(12,8),
  avg_brier numeric(16,10),
  avg_log_loss numeric(16,10),
  avg_signed_return numeric(16,8),
  reliability_weight numeric(8,6) not null default 1,
  evaluated_through timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint market_agent_performance_weight_check check (reliability_weight >= 0.5 and reliability_weight <= 1.5),
  constraint market_agent_performance_counts_check check (sample_count >= 0 and directional_tests >= 0)
);

create unique index if not exists market_agent_performance_unique
  on public.market_agent_performance (portfolio_id, agent_type);
create index if not exists market_agent_performance_scope_idx
  on public.market_agent_performance (organization_id, portfolio_id, updated_at desc);

alter table public.market_agent_outcomes enable row level security;
alter table public.market_agent_performance enable row level security;

comment on table public.market_agent_outcomes is
  'Matured specialist-thesis outcome evidence. Used only to adjust reasoning influence; never to increase execution authority.';
comment on column public.market_agent_performance.reliability_weight is
  'Bounded reasoning influence multiplier in [0.5,1.5]. Has no authority effect and cannot bypass independent risk controls.';

commit;
