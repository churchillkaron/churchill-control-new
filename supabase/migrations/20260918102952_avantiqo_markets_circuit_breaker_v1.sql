begin;

alter table public.market_automation_policies
  add column if not exists circuit_breaker_latched boolean not null default false,
  add column if not exists circuit_breaker_reason text,
  add column if not exists circuit_breaker_triggered_at timestamptz,
  add column if not exists circuit_breaker_reset_at timestamptz;

create table if not exists public.market_risk_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  event_type text not null,
  severity text not null default 'CRITICAL',
  status text not null default 'OPEN',
  reason_codes text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  action_taken jsonb not null default '{}'::jsonb,
  authority_effect text not null default 'PAPER_ONLY',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint market_risk_event_type_check check (
    event_type in ('PORTFOLIO_CIRCUIT_BREAKER')
  ),
  constraint market_risk_event_severity_check check (
    severity in ('WARNING','CRITICAL')
  ),
  constraint market_risk_event_status_check check (
    status in ('OPEN','RESOLVED')
  ),
  constraint market_risk_event_authority_check check (
    authority_effect = 'PAPER_ONLY'
  )
);

create index if not exists market_risk_events_scope_idx
  on public.market_risk_events (
    organization_id,
    portfolio_id,
    created_at desc
  );

create unique index if not exists market_risk_events_one_open_breaker_idx
  on public.market_risk_events (organization_id, portfolio_id, event_type)
  where status = 'OPEN';

alter table public.market_risk_events enable row level security;

comment on table public.market_risk_events is
  'Durable PAPER-only risk events such as daily-loss or portfolio-drawdown circuit-breaker breaches.';
comment on column public.market_automation_policies.circuit_breaker_latched is
  'Latched PAPER circuit breaker. Once true, new strategy entries remain disabled until an owner-authorized reset.';
comment on column public.market_automation_policies.circuit_breaker_reason is
  'Latest deterministic reason for the latched PAPER circuit breaker.';

commit;
