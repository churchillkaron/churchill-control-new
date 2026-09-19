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
  end if;  select * into v_decision
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
    p_expires_at,    coalesce(p_risk_snapshot, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb)
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
  'Creates one PAPER order while holding the exact governed decision row lock, preventing concurrent cancellation or supersession from racing order creation.';

commit;
