begin;

alter table public.market_paper_accounts
  add column if not exists execution_revision bigint not null default 0;

alter table public.market_paper_accounts
  drop constraint if exists market_paper_accounts_execution_revision_check;
alter table public.market_paper_accounts
  add constraint market_paper_accounts_execution_revision_check
  check (execution_revision >= 0);

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
  v_decision public.market_decisions%rowtype;  v_account public.market_paper_accounts%rowtype;
  v_result jsonb;
  v_fill_id uuid;
  v_realized_pnl_delta numeric;
  v_expected_revision bigint;
  v_next_revision bigint;
begin
  v_expected_revision := nullif(
    p_execution_quality #>> '{risk_revalidation,execution_revision}',
    ''
  )::bigint;

  if v_expected_revision is null then
    raise exception 'PAPER_RISK_EXECUTION_REVISION_REQUIRED';
  end if;

  select * into v_order
  from public.market_paper_orders
  where id = p_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'PAPER_ORDER_NOT_FOUND';
  end if;

  select * into v_decision
  from public.market_decisions
  where id = v_order.decision_id
    and organization_id = p_organization_id
  for update;  if not found or v_decision.risk_status <> 'APPROVED_PAPER' then
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
  for update;

  if not found then
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
    p_slippage_bps,    p_snapshot_id
  );

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
        'execution_quality',
        coalesce(p_execution_quality, '{}'::jsonb),
        'realized_pnl_delta',
        v_realized_pnl_delta,
        'execution_revision_before',
        v_expected_revision,
        'execution_revision_after',
        v_next_revision
      )
    where id = v_fill_id
      and organization_id = p_organization_id;
  end if;  return v_result || jsonb_build_object(
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
  'Applies a governed PAPER fill only when the portfolio execution revision still matches the exact state used for risk revalidation.';

commit;
