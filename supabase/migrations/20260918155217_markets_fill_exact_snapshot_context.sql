begin;

create or replace function public.market_assert_paper_fill_quote_binding()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.market_paper_orders%rowtype;
  v_snapshot public.market_live_snapshots%rowtype;
  v_context_snapshot_id uuid;
  v_context_order_id uuid;
  v_context_fingerprint text;
  v_context_quote_at timestamptz;
  v_reference_price numeric;
  v_quote_round_lots numeric;
  v_displayed_shares numeric;
  v_max_fill_quantity numeric;
  v_expected_fill_price numeric;
  v_side text;
begin
  v_context_snapshot_id := nullif(
    current_setting('app.market_execution_snapshot_id', true), ''
  )::uuid;
  v_context_order_id := nullif(
    current_setting('app.market_execution_order_id', true), ''
  )::uuid;
  v_context_fingerprint := lower(btrim(coalesce(
    current_setting('app.market_execution_quote_fingerprint', true), ''
  )));
  v_context_quote_at := nullif(
    current_setting('app.market_execution_quote_at', true), ''
  )::timestamptz;

  if v_context_snapshot_id is null
     or v_context_order_id is null
     or v_context_fingerprint !~ '^[a-f0-9]{64}$'
     or v_context_quote_at is null then
    raise exception 'PAPER_FILL_EXECUTION_CONTEXT_REQUIRED';
  end if;
  if v_context_order_id <> new.order_id then
    raise exception 'PAPER_FILL_EXECUTION_CONTEXT_ORDER_MISMATCH';
  end if;

  select * into v_order
  from public.market_paper_orders
  where id = new.order_id
    and organization_id = new.organization_id
    and portfolio_id = new.portfolio_id
  for share;

  if not found then
    raise exception 'PAPER_FILL_ORDER_REQUIRED';
  end if;

  select * into v_snapshot
  from public.market_live_snapshots
  where id = v_context_snapshot_id
    and organization_id = new.organization_id
    and portfolio_id = new.portfolio_id
    and upper(symbol) = upper(new.symbol)
  for share;

  if not found then
    raise exception 'PAPER_FILL_EXACT_LIVE_QUOTE_REQUIRED';
  end if;
  if lower(coalesce(v_snapshot.latest_quote_fingerprint, '')) <> v_context_fingerprint
     or v_snapshot.latest_quote_at is distinct from v_context_quote_at then
    raise exception 'PAPER_FILL_EXECUTION_CONTEXT_QUOTE_MISMATCH';
  end if;

  v_side := upper(coalesce(v_order.side, ''));
  if v_side not in ('BUY', 'SELL') then
    raise exception 'PAPER_FILL_SIDE_INVALID';
  end if;

  if lower(coalesce(v_snapshot.provider, '')) <> 'alpaca'
     or lower(coalesce(v_snapshot.provenance->>'transport', '')) <> 'websocket' then
    raise exception 'PAPER_FILL_EXECUTION_SOURCE_UNSUPPORTED';
  end if;

  if v_side = 'BUY' then
    v_reference_price := v_snapshot.ask_price;
    v_quote_round_lots := v_snapshot.ask_size;
  else
    v_reference_price := v_snapshot.bid_price;
    v_quote_round_lots := v_snapshot.bid_size;
  end if;

  if v_reference_price is null or v_reference_price <= 0 then
    raise exception 'PAPER_FILL_SIDE_QUOTE_PRICE_REQUIRED';
  end if;
  if v_quote_round_lots is null or v_quote_round_lots <= 0 then
    raise exception 'PAPER_FILL_SIDE_QUOTE_LIQUIDITY_REQUIRED';
  end if;
  if new.slippage_bps is null or new.slippage_bps < 0 then
    raise exception 'PAPER_FILL_SLIPPAGE_INVALID';
  end if;

  v_expected_fill_price := case
    when v_side = 'BUY'
      then v_reference_price * (1 + (new.slippage_bps / 10000.0))
    else v_reference_price * (1 - (new.slippage_bps / 10000.0))
  end;

  if round(new.price, 8) <> round(v_expected_fill_price, 8) then
    raise exception 'PAPER_FILL_PRICE_NOT_BOUND_TO_LIVE_QUOTE';
  end if;

  v_displayed_shares := v_quote_round_lots * 100;
  v_max_fill_quantity := v_displayed_shares * 0.25;

  if new.quantity is null or new.quantity <= 0 then
    raise exception 'PAPER_FILL_QUANTITY_INVALID';
  end if;
  if new.quantity > v_max_fill_quantity + 0.00000001 then
    raise exception 'PAPER_FILL_EXCEEDS_DISPLAYED_LIQUIDITY_PARTICIPATION';
  end if;

  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'quote_binding',
      jsonb_build_object(
        'snapshot_id', v_snapshot.id,
        'provider', lower(v_snapshot.provider),
        'feed', lower(v_snapshot.feed),
        'transport', 'websocket',
        'quote_at', v_snapshot.latest_quote_at,
        'quote_fingerprint', v_snapshot.latest_quote_fingerprint,
        'reference_side', v_side,
        'reference_price', v_reference_price,
        'quote_round_lots', v_quote_round_lots,
        'displayed_shares', v_displayed_shares,
        'max_participation', 0.25,
        'max_fill_quantity', v_max_fill_quantity,
        'expected_fill_price', round(v_expected_fill_price, 8)
      )
    );

  return new;
end;
$$;

revoke all on function public.market_assert_paper_fill_quote_binding()
from public, anon, authenticated;

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
  v_feed_status public.market_feed_status%rowtype;
  v_result jsonb;
  v_fill_id uuid;
  v_realized_pnl_delta numeric;
  v_expected_revision bigint;
  v_next_revision bigint;
  v_quote_fingerprint text;
  v_quote_at timestamptz;
  v_persisted_fingerprint text;
  v_persisted_quote_at timestamptz;
  v_persisted_provider text;
  v_persisted_feed text;
  v_persisted_provenance jsonb;
  v_evidence_provider text;
  v_evidence_feed text;
  v_evidence_transport text;
  v_max_age_seconds numeric;
begin  v_expected_revision := nullif(
    p_execution_quality #>> '{risk_revalidation,execution_revision}', ''
  )::bigint;
  v_quote_fingerprint := lower(btrim(coalesce(
    p_execution_quality #>> '{risk_revalidation,market_data_identity,quote_fingerprint}', ''
  )));
  v_quote_at := nullif(
    p_execution_quality #>> '{risk_revalidation,market_data_identity,quote_at}', ''
  )::timestamptz;
  v_evidence_provider := lower(btrim(coalesce(
    p_execution_quality #>> '{risk_revalidation,feed_authority,provider}', ''
  )));
  v_evidence_feed := lower(btrim(coalesce(
    p_execution_quality #>> '{risk_revalidation,feed_authority,feed}', ''
  )));
  v_evidence_transport := lower(btrim(coalesce(
    p_execution_quality #>> '{risk_revalidation,feed_authority,transport}', ''
  )));
  v_max_age_seconds := coalesce(
    nullif(p_execution_quality #>> '{risk_revalidation,feed_authority,max_age_seconds}', '')::numeric,
    120
  );

  if v_expected_revision is null then
    raise exception 'PAPER_RISK_EXECUTION_REVISION_REQUIRED';
  end if;
  if v_quote_fingerprint !~ '^[a-f0-9]{64}$' or v_quote_at is null then
    raise exception 'PAPER_EXECUTION_QUOTE_IDENTITY_REQUIRED';
  end if;
  if p_snapshot_id is null then
    raise exception 'PAPER_EXECUTION_SNAPSHOT_REQUIRED';
  end if;
  if v_evidence_provider = '' or v_evidence_feed = '' or v_evidence_transport <> 'websocket' then
    raise exception 'PAPER_EXECUTION_FEED_AUTHORITY_REQUIRED';
  end if;
  if v_max_age_seconds < 1 or v_max_age_seconds > 3600 then
    raise exception 'PAPER_EXECUTION_FEED_MAX_AGE_INVALID';
  end if;

  select * into v_order
  from public.market_paper_orders
  where id = p_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'PAPER_ORDER_NOT_FOUND';
  end if;  if v_order.last_execution_quote_fingerprint = v_quote_fingerprint then
    raise exception 'PAPER_EXECUTION_QUOTE_ALREADY_CONSUMED';
  end if;
  if v_order.last_execution_quote_at is not null
     and v_quote_at <= v_order.last_execution_quote_at then
    raise exception 'PAPER_EXECUTION_QUOTE_NOT_MONOTONIC';
  end if;

  select
    latest_quote_fingerprint,
    latest_quote_at,
    lower(provider),
    lower(feed),
    provenance
  into
    v_persisted_fingerprint,
    v_persisted_quote_at,
    v_persisted_provider,
    v_persisted_feed,
    v_persisted_provenance
  from public.market_live_snapshots
  where id = p_snapshot_id
    and organization_id = p_organization_id
    and portfolio_id = v_order.portfolio_id
    and upper(symbol) = upper(v_order.symbol)
  for share;

  if not found then
    raise exception 'PAPER_EXECUTION_LIVE_SNAPSHOT_REQUIRED';
  end if;
  if v_persisted_fingerprint is null then
    raise exception 'PAPER_EXECUTION_SNAPSHOT_IDENTITY_MISSING';
  end if;
  if lower(v_persisted_fingerprint) <> v_quote_fingerprint
     or v_persisted_quote_at is distinct from v_quote_at then
    raise exception 'PAPER_EXECUTION_SNAPSHOT_IDENTITY_MISMATCH';
  end if;
  if v_persisted_provider <> v_evidence_provider
     or v_persisted_feed <> v_evidence_feed
     or lower(coalesce(v_persisted_provenance->>'transport', '')) <> 'websocket' then
    raise exception 'PAPER_EXECUTION_FEED_IDENTITY_MISMATCH';
  end if;  select * into v_feed_status
  from public.market_feed_status
  where organization_id = p_organization_id
    and portfolio_id = v_order.portfolio_id
    and lower(provider) = v_persisted_provider
    and lower(feed) = v_persisted_feed
  for share;

  if not found then
    raise exception 'PAPER_EXECUTION_FEED_STATUS_REQUIRED';
  end if;
  if coalesce(v_feed_status.metadata->>'stock_stream_ready', 'false') <> 'true' then
    raise exception 'PAPER_EXECUTION_STOCK_STREAM_NOT_READY';
  end if;
  if not (upper(v_order.symbol) = any(v_feed_status.subscribed_symbols)) then
    raise exception 'PAPER_EXECUTION_SYMBOL_NOT_SUBSCRIBED';
  end if;
  if v_feed_status.last_stock_message_at is null
     or extract(epoch from (now() - v_feed_status.last_stock_message_at)) > v_max_age_seconds then
    raise exception 'PAPER_EXECUTION_STOCK_HEARTBEAT_STALE';
  end if;
  if v_feed_status.last_stock_flush_at is null
     or extract(epoch from (now() - v_feed_status.last_stock_flush_at)) > v_max_age_seconds then
    raise exception 'PAPER_EXECUTION_STOCK_FLUSH_STALE';
  end if;
  if extract(epoch from (now() - v_feed_status.updated_at)) > v_max_age_seconds then
    raise exception 'PAPER_EXECUTION_FEED_STATUS_STALE';
  end if;
  if v_feed_status.last_stock_flush_at < v_quote_at then
    raise exception 'PAPER_EXECUTION_QUOTE_NOT_FLUSH_CONFIRMED';
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
  end if;  select * into v_account
  from public.market_paper_accounts
  where portfolio_id = v_order.portfolio_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'PAPER_ACCOUNT_REQUIRED';
  end if;

  if coalesce(v_account.execution_revision, 0) <> v_expected_revision then
    raise exception 'PAPER_RISK_REVALIDATION_STALE';
  end if;

  perform set_config('app.market_execution_snapshot_id', p_snapshot_id::text, true);
  perform set_config('app.market_execution_order_id', p_order_id::text, true);
  perform set_config('app.market_execution_quote_fingerprint', v_quote_fingerprint, true);
  perform set_config('app.market_execution_quote_at', v_quote_at::text, true);

  v_result := public.market_apply_paper_fill(
    p_organization_id,
    p_order_id,
    p_fill_quantity,
    p_fill_price,
    p_fee_amount,
    p_slippage_bps,
    null
  );

  perform set_config('app.market_execution_snapshot_id', '', true);
  perform set_config('app.market_execution_order_id', '', true);
  perform set_config('app.market_execution_quote_fingerprint', '', true);
  perform set_config('app.market_execution_quote_at', '', true);

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
    nullif(v_result ->> 'realized_pnl_delta', '')::numeric,
    0
  );

  if v_fill_id is not null then
    update public.market_paper_fills
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'snapshot_id', p_snapshot_id,
        'quote_fingerprint', v_quote_fingerprint,
        'quote_at', v_quote_at,
        'provider', v_persisted_provider,
        'feed', v_persisted_feed,
        'transport', 'websocket',
        'execution_quality', coalesce(p_execution_quality, '{}'::jsonb),
        'realized_pnl_delta', v_realized_pnl_delta,
        'execution_revision_before', v_expected_revision,
        'execution_revision_after', v_next_revision
      )
    where id = v_fill_id
      and organization_id = p_organization_id;
  end if;  return v_result || jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'quote_fingerprint', v_quote_fingerprint,
    'quote_at', v_quote_at,
    'provider', v_persisted_provider,
    'feed', v_persisted_feed,
    'transport', 'websocket',
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

comment on function public.market_apply_paper_fill_with_quality(
  uuid, uuid, numeric, numeric, numeric, numeric, uuid, jsonb
) is
  'Applies a PAPER fill only from the exact live websocket quote identity and healthy stock-feed authority used by execution-time risk validation.';

commit;
