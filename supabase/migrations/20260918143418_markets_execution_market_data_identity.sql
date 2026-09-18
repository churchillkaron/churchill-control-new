begin;

alter table public.market_snapshots
  add column if not exists latest_trade_at timestamptz,
  add column if not exists latest_trade_id text,
  add column if not exists latest_quote_at timestamptz,
  add column if not exists latest_quote_fingerprint text;

alter table public.market_live_snapshots
  add column if not exists latest_trade_at timestamptz,
  add column if not exists latest_trade_id text,
  add column if not exists latest_quote_at timestamptz,
  add column if not exists latest_quote_fingerprint text;

alter table public.market_paper_orders
  add column if not exists last_execution_quote_fingerprint text,
  add column if not exists last_execution_quote_at timestamptz;

alter table public.market_snapshots
  drop constraint if exists market_snapshots_quote_fingerprint_check;
alter table public.market_snapshots
  add constraint market_snapshots_quote_fingerprint_check
  check (
    latest_quote_fingerprint is null
    or latest_quote_fingerprint ~ '^[a-f0-9]{64}$'
  );

alter table public.market_live_snapshots
  drop constraint if exists market_live_snapshots_quote_fingerprint_check;alter table public.market_live_snapshots
  add constraint market_live_snapshots_quote_fingerprint_check
  check (
    latest_quote_fingerprint is null
    or latest_quote_fingerprint ~ '^[a-f0-9]{64}$'
  );

create index if not exists market_snapshots_quote_identity_idx
  on public.market_snapshots (
    organization_id, portfolio_id, symbol, latest_quote_at desc
  )
  where latest_quote_fingerprint is not null;

create index if not exists market_live_snapshots_quote_identity_idx
  on public.market_live_snapshots (
    organization_id, portfolio_id, symbol, latest_quote_at desc
  )
  where latest_quote_fingerprint is not null;

comment on column public.market_live_snapshots.latest_quote_fingerprint is
  'SHA-256 identity of the exact provider quote state. PAPER execution uses this identity for replay prevention instead of the stable live-snapshot row id.';

comment on column public.market_paper_orders.last_execution_quote_fingerprint is
  'Exact quote identity consumed by the most recent PAPER execution slice.';

commit;

begin;

create or replace function public.market_apply_paper_fill_with_quality(
  p_organization_id uuid,
  p_order_id uuid,
  p_fill_quantity numeric,
  p_fill_price numeric,
  p_fee_amount numeric default 0,
  p_slippage_bps numeric default 0,
  p_snapshot_id uuid default null,
  p_execution_quality jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.market_paper_orders%rowtype;
  v_decision public.market_decisions%rowtype;
  v_account public.market_paper_accounts%rowtype;
  v_result jsonb;
  v_fill_id uuid;
  v_realized_pnl_delta numeric;
  v_expected_revision bigint;
  v_next_revision bigint;
  v_quote_fingerprint text;
  v_quote_at timestamptz;
  v_persisted_fingerprint text;
  v_persisted_quote_at timestamptz;
begin
  v_expected_revision := nullif(
    p_execution_quality #>> '{risk_revalidation,execution_revision}', ''
  )::bigint;
  v_quote_fingerprint := lower(btrim(coalesce(
    p_execution_quality #>> '{risk_revalidation,market_data_identity,quote_fingerprint}', ''
  )));  v_quote_at := nullif(
    p_execution_quality #>> '{risk_revalidation,market_data_identity,quote_at}', ''
  )::timestamptz;

  if v_expected_revision is null then
    raise exception 'PAPER_RISK_EXECUTION_REVISION_REQUIRED';
  end if;
  if v_quote_fingerprint !~ '^[a-f0-9]{64}$' or v_quote_at is null then
    raise exception 'PAPER_EXECUTION_QUOTE_IDENTITY_REQUIRED';
  end if;
  if p_snapshot_id is null then
    raise exception 'PAPER_EXECUTION_SNAPSHOT_REQUIRED';
  end if;

  select * into v_order
  from public.market_paper_orders
  where id = p_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'PAPER_ORDER_NOT_FOUND';
  end if;

  if v_order.last_execution_quote_fingerprint = v_quote_fingerprint then
    raise exception 'PAPER_EXECUTION_QUOTE_ALREADY_CONSUMED';
  end if;
  if v_order.last_execution_quote_at is not null
     and v_quote_at <= v_order.last_execution_quote_at then
    raise exception 'PAPER_EXECUTION_QUOTE_NOT_MONOTONIC';
  end if;

  select latest_quote_fingerprint, latest_quote_at
  into v_persisted_fingerprint, v_persisted_quote_at
  from public.market_live_snapshots
  where id = p_snapshot_id
    and organization_id = p_organization_id
    and portfolio_id = v_order.portfolio_id
    and upper(symbol) = upper(v_order.symbol);  if not found then
    select latest_quote_fingerprint, latest_quote_at
    into v_persisted_fingerprint, v_persisted_quote_at
    from public.market_snapshots
    where id = p_snapshot_id
      and organization_id = p_organization_id
      and portfolio_id = v_order.portfolio_id
      and upper(symbol) = upper(v_order.symbol);
  end if;

  if v_persisted_fingerprint is null then
    raise exception 'PAPER_EXECUTION_SNAPSHOT_IDENTITY_MISSING';
  end if;
  if lower(v_persisted_fingerprint) <> v_quote_fingerprint
     or v_persisted_quote_at is distinct from v_quote_at then
    raise exception 'PAPER_EXECUTION_SNAPSHOT_IDENTITY_MISMATCH';
  end if;

  select * into v_decision
  from public.market_decisions
  where id = v_order.decision_id
    and organization_id = p_organization_id
  for update;

  if not found or v_decision.risk_status <> 'APPROVED_PAPER' then
    raise exception 'PAPER_DECISION_NOT_APPROVED';
  end if;

  if upper(coalesce(v_decision.symbol, '')) <> upper(coalesce(v_order.symbol, ''))
     or upper(coalesce(v_decision.action, '')) <> upper(coalesce(v_order.side, '')) then
    raise exception 'PAPER_ORDER_DECISION_MUTATION_MISMATCH';
  end if;

  select * into v_account
  from public.market_paper_accounts
  where portfolio_id = v_order.portfolio_id
    and organization_id = p_organization_id
  for update;  if not found then
    raise exception 'PAPER_ACCOUNT_REQUIRED';
  end if;

  if coalesce(v_account.execution_revision, 0) <> v_expected_revision then
    raise exception 'PAPER_RISK_REVALIDATION_STALE';
  end if;

  v_result := public.market_apply_paper_fill(
    p_organization_id,
    p_order_id,
    p_fill_quantity,
    p_fill_price,
    p_fee_amount,
    p_slippage_bps,
    null
  );

  update public.market_paper_orders
  set last_execution_snapshot_id = p_snapshot_id,
      last_execution_quote_fingerprint = v_quote_fingerprint,
      last_execution_quote_at = v_quote_at
  where id = p_order_id
    and organization_id = p_organization_id;

  update public.market_paper_accounts
  set execution_revision = execution_revision + 1,
      updated_at = now()
  where id = v_account.id
  returning execution_revision into v_next_revision;

  v_fill_id := nullif(v_result ->> 'fill_id', '')::uuid;
  v_realized_pnl_delta := coalesce(
    nullif(v_result ->> 'realized_pnl_delta', '')::numeric, 0
  );  if v_fill_id is not null then
    update public.market_paper_fills
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'snapshot_id', p_snapshot_id,
        'quote_fingerprint', v_quote_fingerprint,
        'quote_at', v_quote_at,
        'execution_quality', coalesce(p_execution_quality, '{}'::jsonb),
        'realized_pnl_delta', v_realized_pnl_delta,
        'execution_revision_before', v_expected_revision,
        'execution_revision_after', v_next_revision
      )
    where id = v_fill_id
      and organization_id = p_organization_id;
  end if;

  return v_result || jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'quote_fingerprint', v_quote_fingerprint,
    'quote_at', v_quote_at,
    'execution_quality', coalesce(p_execution_quality, '{}'::jsonb),
    'realized_pnl_delta', v_realized_pnl_delta,
    'execution_revision_before', v_expected_revision,
    'execution_revision_after', v_next_revision
  );
end;
$$;

revoke all on function public.market_apply_paper_fill_with_quality(
  uuid, uuid, numeric, numeric, numeric, numeric, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.market_apply_paper_fill_with_quality(
  uuid, uuid, numeric, numeric, numeric, numeric, uuid, jsonb
) to service_role;

commit;
