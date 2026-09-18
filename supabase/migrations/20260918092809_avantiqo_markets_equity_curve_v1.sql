begin;

create table if not exists public.market_portfolio_equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  cash_balance numeric(24,8) not null,
  positions_value numeric(24,8) not null,
  equity numeric(24,8) not null,
  realized_pnl numeric(24,8) not null default 0,
  unrealized_pnl numeric(24,8) not null default 0,
  high_water_equity numeric(24,8) not null,
  benchmark_symbol text,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint market_equity_snapshot_source_check check (source_type in ('INITIAL','FILL','MARK','CYCLE')),
  constraint market_equity_snapshot_values_check check (
    cash_balance >= 0 and positions_value >= 0 and equity >= 0 and high_water_equity >= 0
  )
);

create index if not exists market_equity_snapshots_scope_idx
  on public.market_portfolio_equity_snapshots (
    organization_id,
    portfolio_id,
    recorded_at asc
  );

create unique index if not exists market_equity_snapshots_source_unique
  on public.market_portfolio_equity_snapshots (portfolio_id, source_type, source_id)
  where source_id is not null;

alter table public.market_portfolio_equity_snapshots enable row level security;

create or replace function public.market_reject_equity_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'MARKET_EQUITY_SNAPSHOT_APPEND_ONLY';
end;
$$;

revoke all on function public.market_reject_equity_snapshot_mutation() from public, anon, authenticated;
grant execute on function public.market_reject_equity_snapshot_mutation() to service_role;

drop trigger if exists market_equity_snapshot_append_only
  on public.market_portfolio_equity_snapshots;
create trigger market_equity_snapshot_append_only
before update or delete on public.market_portfolio_equity_snapshots
for each row execute function public.market_reject_equity_snapshot_mutation();

comment on table public.market_portfolio_equity_snapshots is
  'Append-only paper portfolio equity curve. Used for historical performance measurement only; it never grants execution authority.';

commit;
