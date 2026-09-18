begin;

alter table public.market_paper_orders
  add column if not exists filled_quantity numeric(24,8) not null default 0,
  add column if not exists remaining_quantity numeric(24,8),
  add column if not exists last_execution_snapshot_id uuid;

update public.market_paper_orders
set filled_quantity = case
      when status = 'FILLED' then quantity
      else coalesce(filled_quantity, 0)
    end,
    remaining_quantity = case
      when status = 'FILLED' then 0
      else greatest(quantity - coalesce(filled_quantity, 0), 0)
    end
where remaining_quantity is null
   or (status = 'FILLED' and coalesce(filled_quantity, 0) = 0);

alter table public.market_paper_orders
  alter column remaining_quantity set not null;

alter table public.market_paper_orders
  drop constraint if exists market_paper_order_status_check;
alter table public.market_paper_orders
  add constraint market_paper_order_status_check
  check (status in ('QUEUED','PARTIALLY_FILLED','FILLED','REJECTED','CANCELLED','EXPIRED'));

alter table public.market_paper_orders
  drop constraint if exists market_paper_order_fill_quantity_check;
alter table public.market_paper_orders
  add constraint market_paper_order_fill_quantity_check
  check (
    filled_quantity >= 0
    and remaining_quantity >= 0
    and filled_quantity <= quantity
    and remaining_quantity <= quantity
    and abs((filled_quantity + remaining_quantity) - quantity) < 0.00000001
  );

drop index if exists public.market_paper_fills_order_unique;
create index if not exists market_paper_fills_order_idx
  on public.market_paper_fills (order_id, filled_at asc);

drop function if exists public.market_apply_paper_fill(uuid, uuid, numeric, numeric, numeric);

create or replace function public.market_apply_paper_fill(
  p_organization_id uuid,
  p_order_id uuid,
  p_fill_quantity numeric,
  p_fill_price numeric,
  p_fee_amount numeric default 0,
  p_slippage_bps numeric default 0,
  p_snapshot_id uuid default null
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
  v_position public.market_paper_positions%rowtype;
  v_position_exists boolean := false;
  v_fill_notional numeric;
  v_realized numeric := 0;
  v_new_qty numeric;
  v_new_avg numeric;
  v_market_value numeric := 0;
  v_unrealized numeric := 0;
  v_prior_filled_qty numeric;
  v_new_filled_qty numeric;
  v_new_remaining_qty numeric;
  v_weighted_fill_price numeric;
  v_new_order_status text;
  v_fill_id uuid;
begin
  if p_fill_quantity is null or p_fill_quantity <= 0 then
    raise exception 'INVALID_PAPER_FILL_QUANTITY';
  end if;
  if p_fill_price is null or p_fill_price <= 0 then
    raise exception 'INVALID_PAPER_FILL_PRICE';
  end if;
  if coalesce(p_fee_amount, 0) < 0 or coalesce(p_slippage_bps, 0) < 0 then
    raise exception 'INVALID_PAPER_FILL_COST';
  end if;

  select * into v_order
  from public.market_paper_orders
  where id = p_order_id
    and organization_id = p_organization_id
  for update;

  if not found then raise exception 'PAPER_ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('QUEUED','PARTIALLY_FILLED') then
    raise exception 'PAPER_ORDER_NOT_FILLABLE';
  end if;
  if p_snapshot_id is not null and v_order.last_execution_snapshot_id = p_snapshot_id then
    raise exception 'PAPER_SNAPSHOT_ALREADY_CONSUMED';
  end if;

  v_prior_filled_qty := coalesce(v_order.filled_quantity, 0);
  if coalesce(v_order.remaining_quantity, v_order.quantity - v_prior_filled_qty) <= 0 then
    raise exception 'PAPER_ORDER_ALREADY_FILLED';
  end if;
  if p_fill_quantity > coalesce(v_order.remaining_quantity, v_order.quantity - v_prior_filled_qty) then
    raise exception 'PAPER_FILL_EXCEEDS_REMAINING_QUANTITY';
  end if;

  select * into v_decision
  from public.market_decisions
  where id = v_order.decision_id
    and organization_id = p_organization_id
  for update;

  if not found or v_decision.risk_status <> 'APPROVED_PAPER' then
    raise exception 'PAPER_DECISION_NOT_APPROVED';
  end if;

  select * into v_account
  from public.market_paper_accounts
  where portfolio_id = v_order.portfolio_id
    and organization_id = p_organization_id
  for update;

  if not found then
    insert into public.market_paper_accounts (organization_id, portfolio_id, base_currency)
    select p_organization_id, v_order.portfolio_id, coalesce(base_currency, 'USD')
    from public.market_portfolios
    where id = v_order.portfolio_id
      and organization_id = p_organization_id
    returning * into v_account;

    if not found then raise exception 'PAPER_PORTFOLIO_NOT_FOUND'; end if;
  end if;

  if v_account.daily_equity_date <> current_date then
    update public.market_paper_accounts
    set daily_equity_start = equity,
        daily_equity_date = current_date,
        updated_at = now()
    where id = v_account.id
    returning * into v_account;
  end if;

  select * into v_position
  from public.market_paper_positions
  where portfolio_id = v_order.portfolio_id
    and organization_id = p_organization_id
    and upper(symbol) = upper(v_order.symbol)
  for update;

  v_position_exists := found;
  v_fill_notional := p_fill_quantity * p_fill_price;

  if v_order.side = 'BUY' then
    if v_account.cash_balance < v_fill_notional + coalesce(p_fee_amount, 0) then
      raise exception 'INSUFFICIENT_PAPER_CASH';
    end if;

    v_new_qty := coalesce(v_position.quantity, 0) + p_fill_quantity;
    v_new_avg := (
      (coalesce(v_position.quantity, 0) * coalesce(v_position.average_entry_price, 0))
      + v_fill_notional + coalesce(p_fee_amount, 0)
    ) / v_new_qty;

    update public.market_paper_accounts
    set cash_balance = cash_balance - v_fill_notional - coalesce(p_fee_amount, 0),
        updated_at = now()
    where id = v_account.id;
  else
    if not v_position_exists or coalesce(v_position.quantity, 0) < p_fill_quantity then
      raise exception 'INSUFFICIENT_PAPER_POSITION';
    end if;

    v_new_qty := v_position.quantity - p_fill_quantity;
    v_new_avg := case when v_new_qty > 0 then v_position.average_entry_price else null end;
    v_realized := ((p_fill_price - coalesce(v_position.average_entry_price, 0)) * p_fill_quantity)
      - coalesce(p_fee_amount, 0);

    update public.market_paper_accounts
    set cash_balance = cash_balance + v_fill_notional - coalesce(p_fee_amount, 0),
        realized_pnl = realized_pnl + v_realized,
        updated_at = now()
    where id = v_account.id;
  end if;

  insert into public.market_paper_positions (
    organization_id, portfolio_id, symbol, quantity, average_entry_price,
    market_price, market_value, realized_pnl, unrealized_pnl, updated_at
  ) values (
    p_organization_id, v_order.portfolio_id, v_order.symbol, v_new_qty, v_new_avg,
    p_fill_price, v_new_qty * p_fill_price,
    coalesce(v_position.realized_pnl, 0) + v_realized,
    case when v_new_qty > 0 and v_new_avg is not null
      then (p_fill_price - v_new_avg) * v_new_qty else 0 end,
    now()
  )
  on conflict (portfolio_id, symbol)
  do update set
    quantity = excluded.quantity,
    average_entry_price = excluded.average_entry_price,
    market_price = excluded.market_price,
    market_value = excluded.market_value,
    realized_pnl = excluded.realized_pnl,
    unrealized_pnl = excluded.unrealized_pnl,
    updated_at = now();

  insert into public.market_paper_fills (
    organization_id, portfolio_id, order_id, symbol, side, quantity, price,
    notional, slippage_bps, fee_amount, metadata
  ) values (
    p_organization_id, v_order.portfolio_id, v_order.id, v_order.symbol, v_order.side,
    p_fill_quantity, p_fill_price, v_fill_notional, coalesce(p_slippage_bps, 0),
    coalesce(p_fee_amount, 0),
    jsonb_build_object(
      'simulation_only', true,
      'snapshot_id', p_snapshot_id,
      'partial_fill', p_fill_quantity < coalesce(v_order.remaining_quantity, v_order.quantity)
    )
  )
  returning id into v_fill_id;

  v_new_filled_qty := v_prior_filled_qty + p_fill_quantity;
  v_new_remaining_qty := greatest(v_order.quantity - v_new_filled_qty, 0);
  v_new_order_status := case
    when v_new_remaining_qty <= 0.00000001 then 'FILLED'
    else 'PARTIALLY_FILLED'
  end;

  v_weighted_fill_price := case
    when v_new_filled_qty > 0 then
      ((v_prior_filled_qty * coalesce(v_order.filled_price, 0))
        + (p_fill_quantity * p_fill_price)) / v_new_filled_qty
    else null
  end;

  update public.market_paper_orders
  set status = v_new_order_status,
      filled_quantity = v_new_filled_qty,
      remaining_quantity = v_new_remaining_qty,
      filled_price = v_weighted_fill_price,
      filled_at = case when v_new_order_status = 'FILLED' then now() else filled_at end,
      last_execution_snapshot_id = p_snapshot_id
  where id = v_order.id;

  select coalesce(sum(market_value), 0), coalesce(sum(unrealized_pnl), 0)
  into v_market_value, v_unrealized
  from public.market_paper_positions
  where portfolio_id = v_order.portfolio_id
    and organization_id = p_organization_id;

  update public.market_paper_accounts
  set equity = cash_balance + v_market_value,
      unrealized_pnl = v_unrealized,
      high_water_equity = greatest(high_water_equity, cash_balance + v_market_value),
      updated_at = now()
  where id = v_account.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'fill_id', v_fill_id,
    'symbol', v_order.symbol,
    'side', v_order.side,
    'fill_quantity', p_fill_quantity,
    'filled_quantity', v_new_filled_qty,
    'remaining_quantity', v_new_remaining_qty,
    'order_status', v_new_order_status,
    'fill_price', p_fill_price,
    'average_fill_price', v_weighted_fill_price,
    'notional', v_fill_notional,
    'realized_pnl_delta', v_realized,
    'snapshot_id', p_snapshot_id
  );
end;
$$;

revoke all on function public.market_apply_paper_fill(uuid, uuid, numeric, numeric, numeric, numeric, uuid)
from public, anon, authenticated;
grant execute on function public.market_apply_paper_fill(uuid, uuid, numeric, numeric, numeric, numeric, uuid)
to service_role;

commit;
