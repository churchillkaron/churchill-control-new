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
  v_reference_price numeric;
  v_quote_round_lots numeric;
  v_displayed_shares numeric;
  v_max_fill_quantity numeric;
  v_expected_fill_price numeric;
  v_side text;
begin
  select * into v_order
  from public.market_paper_orders
  where id = new.order_id
    and organization_id = new.organization_id
    and portfolio_id = new.portfolio_id
  for share;

  if not found then
    raise exception 'PAPER_FILL_ORDER_REQUIRED';
  end if;

  v_side := upper(coalesce(v_order.side, ''));
  if v_side not in ('BUY', 'SELL') then
    raise exception 'PAPER_FILL_SIDE_INVALID';
  end if;

  select * into v_snapshot
  from public.market_live_snapshots
  where organization_id = new.organization_id
    and portfolio_id = new.portfolio_id
    and upper(symbol) = upper(new.symbol)
    and latest_quote_fingerprint is not null
  order by latest_quote_at desc nulls last
  limit 1
  for share;

  if not found then
    raise exception 'PAPER_FILL_LIVE_QUOTE_REQUIRED';
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

  -- Alpaca stock quote bs/as are round lots. One round lot is 100 shares.
  -- PAPER execution intentionally caps one slice at 25% of displayed side liquidity.
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

drop trigger if exists market_paper_fill_quote_binding_guard
  on public.market_paper_fills;

create trigger market_paper_fill_quote_binding_guard
before insert on public.market_paper_fills
for each row
execute function public.market_assert_paper_fill_quote_binding();

revoke all on function public.market_assert_paper_fill_quote_binding()
from public, anon, authenticated;

comment on function public.market_assert_paper_fill_quote_binding() is
  'Fail-closed PAPER fill guard: every fill must mathematically match the live Alpaca websocket bid/ask plus slippage and remain within 25% of displayed round-lot side liquidity.';

commit;
