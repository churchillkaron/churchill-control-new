begin;

alter table public.market_agent_theses
  add column if not exists evidence_refs jsonb not null default '[]'::jsonb;

alter table public.market_decisions
  add column if not exists evidence_refs jsonb not null default '[]'::jsonb;

comment on column public.market_agent_theses.evidence_refs is
  'Typed durable evidence references used by the specialist thesis, including market bars, snapshots, evidence events, filings and fundamental snapshots.';

comment on column public.market_decisions.evidence_refs is
  'Typed durable union of evidence references supporting the decision. evidence_ids remains reserved for market_evidence_events compatibility.';

commit;
