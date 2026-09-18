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
  v_evidence_fill_quantity numeric;
  v_evidence_fill_price numeric;
  v_evidence_fill_side text;
  v_evidence_order_notional numeric;
  v_evidence_risk_policy_revision timestamptz;
  v_evidence_automation_policy_revision timestamptz;
  v_final_session_evaluated_at timestamptz;
  v_final_session_open boolean;
  v_final_next_close timestamptz;
  v_final_clock_timestamp timestamptz;
  v_final_asset_status text;
  v_final_asset_tradable boolean;
  v_risk_policy public.market_risk_policies%rowtype;
  v_automation_policy public.market_automation_policies%rowtype;
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
  v_evidence_fill_quantity := nullif(
    p_execution_quality->>'fill_quantity',
    ''
  )::numeric;
  v_evidence_fill_price := nullif(
    p_execution_quality->>'fill_price',
    ''
  )::numeric;
  v_evidence_fill_side := upper(btrim(coalesce(
    p_execution_quality->>'side',
    ''
  )));
  v_evidence_order_notional := nullif(
    p_execution_quality #>> '{risk_revalidation,execution_risk,order_notional}',
    ''
  )::numeric;
  v_evidence_risk_policy_revision := nullif(
    p_execution_quality #>> '{risk_revalidation,risk_policy_revision}',
    ''
  )::timestamptz;
  v_evidence_automation_policy_revision := nullif(
    p_execution_quality #>> '{risk_revalidation,automation_policy_revision}',
    ''
  )::timestamptz;
  v_final_session_evaluated_at := nullif(
    p_execution_quality #>> '{final_session_revalidation,evaluated_at}',
    ''
  )::timestamptz;
  v_final_session_open := coalesce(
    nullif(
      p_execution_quality #>> '{final_session_revalidation,metrics,session_open}',
      ''
    )::boolean,
    false
  );
  v_final_next_close := nullif(
    p_execution_quality #>> '{final_session_revalidation,metrics,next_close}',
    ''
  )::timestamptz;
  v_final_clock_timestamp := nullif(
    p_execution_quality #>> '{final_session_revalidation,clock_timestamp}',
    ''
  )::timestamptz;
  v_final_asset_status := lower(btrim(coalesce(
    p_execution_quality #>> '{final_session_revalidation,asset_status}',
    ''
  )));
  v_final_asset_tradable := coalesce(
    nullif(
      p_execution_quality #>> '{final_session_revalidation,asset_tradable}',
      ''
    )::boolean,
    false
  );

  if v_expected_revision is null then
    raise exception 'PAPER_RISK_EXECUTION_REVISION_REQUIRED';
  end if;
  if v_evidence_risk_policy_revision is null then
    raise exception 'PAPER_RISK_POLICY_REVISION_REQUIRED';
  end if;
  if v_evidence_automation_policy_revision is null then
    raise exception 'PAPER_AUTOMATION_POLICY_REVISION_REQUIRED';
  end if;
  if v_max_age_seconds < 1 or v_max_age_seconds > 3600 then
    raise exception 'PAPER_EXECUTION_FEED_MAX_AGE_INVALID';
  end if;
  if v_final_session_evaluated_at is null
     or v_final_next_close is null
     or v_final_clock_timestamp is null then
    raise exception 'PAPER_FINAL_SESSION_EVIDENCE_REQUIRED';
  end if;
  if v_final_session_open is not true then
    raise exception 'PAPER_FINAL_SESSION_NOT_OPEN';
  end if;
  if v_final_asset_status <> 'active' or v_final_asset_tradable is not true then
    raise exception 'PAPER_FINAL_ASSET_NOT_TRADABLE';
  end if;
  if v_final_session_evaluated_at > now() + interval '5 seconds'
     or extract(epoch from (now() - v_final_session_evaluated_at))
        > least(v_max_age_seconds, 30) then
    raise exception 'PAPER_FINAL_SESSION_EVIDENCE_STALE';
  end if;
  if v_final_clock_timestamp > now() + interval '5 seconds'
     or extract(epoch from (now() - v_final_clock_timestamp))
        > least(v_max_age_seconds, 30) then
    raise exception 'PAPER_FINAL_SESSION_CLOCK_STALE';
  end if;
  if v_final_next_close <= v_final_clock_timestamp then
    raise exception 'PAPER_FINAL_SESSION_CLOCK_INVALID';
  end if;
  if now() >= v_final_next_close then
    raise exception 'PAPER_MARKET_SESSION_CLOSED_AT_FILL';
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

  select * into v_order
  from public.market_paper_orders
  where id = p_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'PAPER_ORDER_NOT_FOUND';
  end if;
  if v_order.status not in ('QUEUED','PARTIALLY_FILLED') then
    raise exception 'PAPER_ORDER_NOT_FILLABLE';
  end if;
  if upper(coalesce(v_order.time_in_force, '')) not in ('DAY','GTC') then
    raise exception 'PAPER_ORDER_TIME_IN_FORCE_INVALID';
  end if;
  if v_order.expires_at is not null and v_order.expires_at <= now() then
    raise exception 'PAPER_ORDER_TIF_EXPIRED_AT_FILL';
  end if;

  if v_evidence_fill_quantity is null
     or v_evidence_fill_price is null
     or v_evidence_order_notional is null
     or v_evidence_fill_side = '' then
    raise exception 'PAPER_RISK_SLICE_EVIDENCE_REQUIRED';
  end if;
  if round(v_evidence_fill_quantity, 8) <> round(p_fill_quantity, 8) then
    raise exception 'PAPER_FILL_QUANTITY_RISK_SLICE_MISMATCH';
  end if;
  if round(v_evidence_fill_price, 8) <> round(p_fill_price, 8) then
    raise exception 'PAPER_FILL_PRICE_RISK_SLICE_MISMATCH';
  end if;
  if v_evidence_fill_side <> upper(coalesce(v_order.side, '')) then
    raise exception 'PAPER_FILL_SIDE_RISK_SLICE_MISMATCH';
  end if;
  if round(v_evidence_order_notional, 8)
     <> round(p_fill_quantity * p_fill_price, 8) then
    raise exception 'PAPER_FILL_NOTIONAL_RISK_SLICE_MISMATCH';
  end if;

  select * into v_risk_policy
  from public.market_risk_policies
  where organization_id = p_organization_id
    and portfolio_id = v_order.portfolio_id
  for share;

  if not found then
    raise exception 'PAPER_RISK_POLICY_REQUIRED';
  end if;
  if v_risk_policy.updated_at is distinct from v_evidence_risk_policy_revision then
    raise exception 'PAPER_RISK_POLICY_REVISION_STALE';
  end if;

  select * into v_automation_policy
  from public.market_automation_policies
  where organization_id = p_organization_id
    and portfolio_id = v_order.portfolio_id
  for share;

  if not found then
    raise exception 'PAPER_AUTOMATION_POLICY_REQUIRED';
  end if;
  if v_automation_policy.updated_at is distinct from v_evidence_automation_policy_revision then
    raise exception 'PAPER_AUTOMATION_POLICY_REVISION_STALE';
  end if;
  if v_automation_policy.kill_switch is true then
    raise exception 'PAPER_AUTOMATION_KILL_SWITCH_ACTIVE';
  end if;
  if upper(coalesce(v_order.side, '')) = 'BUY'
     and v_automation_policy.circuit_breaker_latched is true then
    raise exception 'PAPER_PORTFOLIO_CIRCUIT_BREAKER_LATCHED';
  end if;

  if v_order.last_execution_quote_fingerprint = v_quote_fingerprint then
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
  if v_decision.expires_at is not null and v_decision.expires_at <= now() then
    raise exception 'PAPER_DECISION_EXPIRED_AT_FILL';
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
