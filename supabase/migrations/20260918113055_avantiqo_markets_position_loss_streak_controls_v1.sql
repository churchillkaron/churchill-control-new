begin;

alter table public.market_risk_policies
  add column if not exists max_open_positions integer not null default 20,
  add column if not exists max_consecutive_losing_closes integer not null default 3,
  add column if not exists loss_streak_cooloff_hours numeric(10,4) not null default 24;

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_open_positions_check;
alter table public.market_risk_policies
  add constraint market_risk_max_open_positions_check
  check (max_open_positions between 1 and 500);

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_consecutive_losses_check;
alter table public.market_risk_policies
  add constraint market_risk_max_consecutive_losses_check
  check (max_consecutive_losing_closes between 1 and 50);

alter table public.market_risk_policies
  drop constraint if exists market_risk_loss_streak_cooloff_check;
alter table public.market_risk_policies
  add constraint market_risk_loss_streak_cooloff_check
  check (loss_streak_cooloff_hours >= 1 and loss_streak_cooloff_hours <= 720);

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
  v_result jsonb;
  v_fill_id uuid;
  v_realized_pnl_delta numeric;
begin
  v_result := public.market_apply_paper_fill(
    p_organization_id,
    p_order_id,
    p_fill_quantity,
    p_fill_price,
    p_fee_amount,
    p_slippage_bps,
    p_snapshot_id
  );

  v_fill_id := nullif(v_result ->> 'fill_id', '')::uuid;
  v_realized_pnl_delta := coalesce(
    nullif(v_result ->> 'realized_pnl_delta', '')::numeric,
    0
  );

  if v_fill_id is not null then
    update public.market_paper_fills
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'execution_quality',
        coalesce(p_execution_quality, '{}'::jsonb),
        'realized_pnl_delta',
        v_realized_pnl_delta
      )
    where id = v_fill_id
      and organization_id = p_organization_id;
  end if;

  return v_result || jsonb_build_object(
    'execution_quality', coalesce(p_execution_quality, '{}'::jsonb),
    'realized_pnl_delta', v_realized_pnl_delta
  );
end;
$$;

revoke all on function public.market_apply_paper_fill_with_quality(
  uuid, uuid, numeric, numeric, numeric, numeric, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.market_apply_paper_fill_with_quality(
  uuid, uuid, numeric, numeric, numeric, numeric, uuid, jsonb
) to service_role;

comment on column public.market_risk_policies.max_open_positions is
  'Maximum simultaneous positive-quantity PAPER positions before new symbols are blocked.';
comment on column public.market_risk_policies.max_consecutive_losing_closes is
  'Number of consecutive realized losing PAPER SELL orders required to activate the strategy cool-off.';
comment on column public.market_risk_policies.loss_streak_cooloff_hours is
  'Duration of the PAPER new-BUY cool-off after the configured losing-close streak is reached.';

commit;
