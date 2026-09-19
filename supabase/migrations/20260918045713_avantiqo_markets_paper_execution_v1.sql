begin;

alter table public.market_decisions
  add column if not exists reference_price numeric(24,8),
  add column if not exists reference_time timestamptz,
  add column if not exists probability_up numeric(7,6);

alter table public.market_decisions drop constraint if exists market_decisions_probability_up_check;
alter table public.market_decisions add constraint market_decisions_probability_up_check
  check (probability_up is null or (probability_up >= 0 and probability_up <= 1));

create table if not exists public.market_paper_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  base_currency text not null default 'USD',
  starting_cash numeric(24,8) not null default 100000,
  cash_balance numeric(24,8) not null default 100000,
  equity numeric(24,8) not null default 100000,
  realized_pnl numeric(24,8) not null default 0,
  unrealized_pnl numeric(24,8) not null default 0,
  daily_equity_start numeric(24,8) not null default 100000,
  daily_equity_date date not null default current_date,
  high_water_equity numeric(24,8) not null default 100000,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_paper_accounts_status_check check (status in ('ACTIVE','PAUSED','ARCHIVED'))
);

create unique index if not exists market_paper_accounts_portfolio_unique
  on public.market_paper_accounts (portfolio_id);

create table if not exists public.market_paper_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  symbol text not null,
  quantity numeric(24,8) not null default 0,
  average_entry_price numeric(24,8),
  market_price numeric(24,8),
  market_value numeric(24,8) not null default 0,
  realized_pnl numeric(24,8) not null default 0,
  unrealized_pnl numeric(24,8) not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists market_paper_positions_portfolio_symbol_unique
  on public.market_paper_positions (portfolio_id, symbol);

create table if not exists public.market_paper_fills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  order_id uuid not null references public.market_paper_orders(id) on delete restrict,
  symbol text not null,
  side text not null,
  quantity numeric(24,8) not null,
  price numeric(24,8) not null,
  notional numeric(24,8) not null,
  slippage_bps numeric(12,6) not null default 0,
  fee_amount numeric(24,8) not null default 0,
  filled_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint market_paper_fills_side_check check (side in ('BUY','SELL')),
  constraint market_paper_fills_quantity_check check (quantity > 0)
);

create unique index if not exists market_paper_fills_order_unique
  on public.market_paper_fills (order_id);

alter table public.market_paper_accounts enable row level security;
alter table public.market_paper_positions enable row level security;
alter table public.market_paper_fills enable row level security;

comment on table public.market_paper_accounts is
  'Simulation account state for Avantiqo Markets. No real brokerage balance is represented here.';
comment on table public.market_paper_positions is
  'Simulation positions derived only from governed paper fills.';
comment on table public.market_paper_fills is
  'Simulation fill ledger. A fill here must never be interpreted as a real broker execution.';

create or replace function public.market_apply_paper_fill(
  p_organization_id uuid,
  p_order_id uuid,
  p_fill_price numeric,
  p_fee_amount numeric default 0,
  p_slippage_bps numeric default 0
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
  v_notional numeric;
  v_realized numeric := 0;
  v_new_qty numeric;
  v_new_avg numeric;
  v_market_value numeric := 0;
  v_unrealized numeric := 0;
begin
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
  if v_order.status <> 'QUEUED' then raise exception 'PAPER_ORDER_NOT_QUEUED'; end if;

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
  v_notional := v_order.quantity * p_fill_price;

  if v_order.side = 'BUY' then
    if v_account.cash_balance < v_notional + coalesce(p_fee_amount, 0) then
      raise exception 'INSUFFICIENT_PAPER_CASH';
    end if;

    v_new_qty := coalesce(v_position.quantity, 0) + v_order.quantity;
    v_new_avg := (
      (coalesce(v_position.quantity, 0) * coalesce(v_position.average_entry_price, 0))
      + v_notional + coalesce(p_fee_amount, 0)
    ) / v_new_qty;

    update public.market_paper_accounts
    set cash_balance = cash_balance - v_notional - coalesce(p_fee_amount, 0),
        updated_at = now()
    where id = v_account.id;
  else
    if not v_position_exists or coalesce(v_position.quantity, 0) < v_order.quantity then
      raise exception 'INSUFFICIENT_PAPER_POSITION';
    end if;

    v_new_qty := v_position.quantity - v_order.quantity;
    v_new_avg := case when v_new_qty > 0 then v_position.average_entry_price else null end;
    v_realized := ((p_fill_price - coalesce(v_position.average_entry_price, 0)) * v_order.quantity)
      - coalesce(p_fee_amount, 0);

    update public.market_paper_accounts
    set cash_balance = cash_balance + v_notional - coalesce(p_fee_amount, 0),
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
    v_order.quantity, p_fill_price, v_notional, coalesce(p_slippage_bps, 0),
    coalesce(p_fee_amount, 0), '{"simulation_only":true}'::jsonb
  );

  update public.market_paper_orders
  set status = 'FILLED',
      filled_price = p_fill_price,
      filled_at = now()
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
    'symbol', v_order.symbol,
    'side', v_order.side,
    'quantity', v_order.quantity,
    'fill_price', p_fill_price,
    'notional', v_notional,
    'realized_pnl_delta', v_realized
  );
end;
$$;

revoke all on function public.market_apply_paper_fill(uuid, uuid, numeric, numeric, numeric) from public;
revoke all on function public.market_apply_paper_fill(uuid, uuid, numeric, numeric, numeric) from anon;
revoke all on function public.market_apply_paper_fill(uuid, uuid, numeric, numeric, numeric) from authenticated;
grant execute on function public.market_apply_paper_fill(uuid, uuid, numeric, numeric, numeric) to service_role;

commit;
