begin;

create or replace function public.market_create_governed_paper_order(
  p_organization_id uuid,
  p_portfolio_id uuid,
  p_decision_id uuid,
  p_symbol text,
  p_side text,
  p_order_type text,
  p_quantity numeric,
  p_limit_price numeric,
  p_requested_price numeric,
  p_time_in_force text,
  p_expires_at timestamptz,
  p_risk_snapshot jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns public.market_paper_orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_decision public.market_decisions%rowtype;
  v_existing public.market_paper_orders%rowtype;
  v_order public.market_paper_orders%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'PAPER_ORDER_QUANTITY_INVALID';
  end if;
  if upper(coalesce(p_order_type, '')) not in ('MARKET','LIMIT') then
    raise exception 'PAPER_ORDER_TYPE_INVALID';
  end if;
  if upper(coalesce(p_time_in_force, '')) not in ('DAY','GTC') then
    raise exception 'PAPER_ORDER_TIME_IN_FORCE_INVALID';
  end if;
  if p_expires_at is null then
    raise exception 'PAPER_ORDER_EXPIRY_REQUIRED';
  end if;
  if p_expires_at <= now() then
    raise exception 'PAPER_ORDER_EXPIRY_NOT_FUTURE';
  end if;
  if upper(p_order_type) = 'LIMIT' and (p_limit_price is null or p_limit_price <= 0) then
    raise exception 'PAPER_LIMIT_PRICE_REQUIRED';
  end if;

  select * into v_decision
  from public.market_decisions
  where id = p_decision_id
    and organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
  for update;

  if not found then
    raise exception 'PAPER_DECISION_NOT_FOUND';
  end if;
  if v_decision.risk_status <> 'APPROVED_PAPER' then
    raise exception 'PAPER_DECISION_NOT_APPROVED';
  end if;
  if v_decision.invalidated_at is not null then
    raise exception 'PAPER_DECISION_INVALIDATED';
  end if;
  if v_decision.expires_at is not null and v_decision.expires_at <= now() then
    raise exception 'PAPER_DECISION_EXPIRED';
  end if;
  if v_decision.expires_at is not null and p_expires_at > v_decision.expires_at then
    raise exception 'PAPER_ORDER_EXPIRY_EXCEEDS_DECISION_AUTHORITY';
  end if;
  if upper(coalesce(v_decision.symbol, '')) <> upper(coalesce(p_symbol, '')) then
    raise exception 'PAPER_ORDER_SYMBOL_MISMATCH';
  end if;
  if upper(coalesce(v_decision.action, '')) <> upper(coalesce(p_side, '')) then
    raise exception 'PAPER_ORDER_SIDE_MISMATCH';
  end if;

  select * into v_existing
  from public.market_paper_orders
  where decision_id = p_decision_id
  limit 1;  if found then
    raise exception 'PAPER_DECISION_ORDER_ALREADY_EXISTS';
  end if;

  insert into public.market_paper_orders (
    organization_id,
    portfolio_id,
    decision_id,
    symbol,
    side,
    order_type,
    quantity,
    filled_quantity,
    remaining_quantity,
    limit_price,
    requested_price,
    status,
    time_in_force,
    expires_at,
    risk_snapshot,
    metadata
  ) values (
    p_organization_id,
    p_portfolio_id,
    p_decision_id,
    upper(p_symbol),
    upper(p_side),
    upper(p_order_type),
    p_quantity,
    0,
    p_quantity,
    p_limit_price,
    p_requested_price,
    'QUEUED',
    upper(p_time_in_force),
    p_expires_at,
    coalesce(p_risk_snapshot, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'paper_execution_model',
        jsonb_build_object(
          'version', 1,
          'slippage_bps', 5,
          'fee_model', 'ZERO_COMMISSION',
          'fee_amount', 0,
          'max_quote_participation', 0.25,
          'quote_round_lot_size', 100
        )
      )
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.market_create_governed_paper_order(
  uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.market_create_governed_paper_order(
  uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, text, timestamptz, jsonb, jsonb
) to service_role;

comment on function public.market_create_governed_paper_order(
  uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, text, timestamptz, jsonb, jsonb
) is
  'Creates one PAPER order while locking its governed decision and enforcing exact type, TIF, future expiry, and expiry no later than decision authority.';

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
  v_execution_model jsonb;
  v_model_version integer;
  v_model_slippage_bps numeric;
  v_model_fee_model text;
  v_model_fee_amount numeric;
  v_model_max_quote_participation numeric;
  v_model_quote_round_lot_size numeric;
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

  v_execution_model := v_order.metadata->'paper_execution_model';
  v_model_version := nullif(v_execution_model->>'version', '')::integer;
  v_model_slippage_bps := nullif(v_execution_model->>'slippage_bps', '')::numeric;
  v_model_fee_model := upper(coalesce(v_execution_model->>'fee_model', ''));
  v_model_fee_amount := nullif(v_execution_model->>'fee_amount', '')::numeric;
  v_model_max_quote_participation := nullif(
    v_execution_model->>'max_quote_participation', ''
  )::numeric;
  v_model_quote_round_lot_size := nullif(
    v_execution_model->>'quote_round_lot_size', ''
  )::numeric;

  if v_model_version <> 1
     or v_model_slippage_bps is null
     or v_model_slippage_bps < 0
     or v_model_slippage_bps > 1000
     or v_model_fee_model <> 'ZERO_COMMISSION'
     or coalesce(v_model_fee_amount, -1) <> 0
     or v_model_max_quote_participation is null
     or v_model_max_quote_participation <= 0
     or v_model_max_quote_participation > 0.25
     or v_model_quote_round_lot_size <> 100 then
    raise exception 'PAPER_EXECUTION_MODEL_INVALID';
  end if;

  if new.slippage_bps is distinct from v_model_slippage_bps then
    raise exception 'PAPER_FILL_SLIPPAGE_MODEL_MISMATCH';
  end if;
  if new.fee_amount is distinct from v_model_fee_amount then
    raise exception 'PAPER_FILL_FEE_MODEL_MISMATCH';
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
  v_expected_fill_price := case
    when v_side = 'BUY'
      then v_reference_price * (1 + (v_model_slippage_bps / 10000.0))
    else v_reference_price * (1 - (v_model_slippage_bps / 10000.0))
  end;

  if upper(coalesce(v_order.order_type, '')) = 'LIMIT' then
    if v_order.limit_price is null or v_order.limit_price <= 0 then
      raise exception 'PAPER_LIMIT_PRICE_REQUIRED';
    end if;
    if v_side = 'BUY' and v_reference_price > v_order.limit_price then
      raise exception 'PAPER_LIMIT_NOT_MARKETABLE';
    end if;
    if v_side = 'SELL' and v_reference_price < v_order.limit_price then
      raise exception 'PAPER_LIMIT_NOT_MARKETABLE';
    end if;

    v_expected_fill_price := case
      when v_side = 'BUY'
        then least(v_expected_fill_price, v_order.limit_price)
      else greatest(v_expected_fill_price, v_order.limit_price)
    end;
  elsif upper(coalesce(v_order.order_type, '')) <> 'MARKET' then
    raise exception 'PAPER_ORDER_TYPE_UNSUPPORTED';
  end if;

  if v_side = 'BUY'
     and upper(v_order.order_type) = 'LIMIT'
     and new.price > v_order.limit_price then
    raise exception 'PAPER_BUY_FILL_EXCEEDS_LIMIT_PRICE';
  end if;
  if v_side = 'SELL'
     and upper(v_order.order_type) = 'LIMIT'
     and new.price < v_order.limit_price then
    raise exception 'PAPER_SELL_FILL_BELOW_LIMIT_PRICE';
  end if;

  if round(new.price, 8) <> round(v_expected_fill_price, 8) then
    raise exception 'PAPER_FILL_PRICE_NOT_BOUND_TO_LIVE_QUOTE';
  end if;

  v_displayed_shares := v_quote_round_lots * v_model_quote_round_lot_size;
  v_max_fill_quantity := v_displayed_shares * v_model_max_quote_participation;

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
        'max_participation', v_model_max_quote_participation,
        'max_fill_quantity', v_max_fill_quantity,
        'expected_fill_price', round(v_expected_fill_price, 8),
        'execution_model', v_execution_model
      )
    );

  return new;
end;
$$;

revoke all on function public.market_assert_paper_fill_quote_binding()
from public, anon, authenticated;



commit;
