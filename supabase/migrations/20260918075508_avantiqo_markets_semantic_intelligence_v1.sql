begin;

alter table public.market_evidence_events
  add column if not exists analysis_status text,
  add column if not exists analysis_version text,
  add column if not exists analyzed_at timestamptz;

alter table public.market_evidence_events drop constraint if exists market_evidence_analysis_status_check;
alter table public.market_evidence_events add constraint market_evidence_analysis_status_check
  check (analysis_status is null or analysis_status in ('PENDING','ANALYZED','FAILED','SKIPPED'));

create index if not exists market_evidence_pending_analysis_idx
  on public.market_evidence_events (organization_id, portfolio_id, observed_at desc)
  where evidence_type = 'NEWS' and (analysis_status is null or analysis_status = 'PENDING');

create table if not exists public.market_fundamental_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  instrument_id uuid references public.market_instruments(id) on delete cascade,
  symbol text not null,
  cik text,
  provider text not null default 'sec_edgar',
  period_end date not null,
  metrics jsonb not null default '{}'::jsonb,
  ratios jsonb not null default '{}'::jsonb,
  score numeric(8,6),
  confidence numeric(7,6) not null default 0,
  stance text not null default 'INSUFFICIENT_EVIDENCE',
  facts_used jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  constraint market_fundamental_score_check check (score is null or (score >= -1 and score <= 1)),
  constraint market_fundamental_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint market_fundamental_stance_check check (stance in ('BULLISH','BEARISH','NEUTRAL','INSUFFICIENT_EVIDENCE'))
);

create index if not exists market_fundamental_scope_idx
  on public.market_fundamental_snapshots (organization_id, portfolio_id, symbol, generated_at desc);

create unique index if not exists market_fundamental_period_unique
  on public.market_fundamental_snapshots (
    organization_id,
    portfolio_id,
    symbol,
    provider,
    period_end
  );

alter table public.market_fundamental_snapshots enable row level security;

comment on table public.market_fundamental_snapshots is
  'Point-in-time deterministic fundamental analysis derived from authoritative filing facts. Scores are probabilistic research inputs, not investment guarantees.';

commit;
