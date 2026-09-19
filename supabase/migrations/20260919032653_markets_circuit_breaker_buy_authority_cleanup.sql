begin;

create or replace function public.market_cancel_open_paper_buy_authority_on_breaker(
  p_organization_id uuid,
  p_portfolio_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_policy public.market_automation_policies%rowtype;
  v_cancelled_orders integer := 0;
  v_cancelled_decisions integer := 0;
begin
  select * into v_policy
  from public.market_automation_policies
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
  for update;

  if not found then
    raise exception 'PAPER_AUTOMATION_POLICY_REQUIRED';
  end if;

  if v_policy.circuit_breaker_latched is not true then
    return jsonb_build_object(
      'cancelled', false,
      'reason', 'CIRCUIT_BREAKER_NOT_LATCHED',
      'cancelled_orders', 0,
      'cancelled_decisions', 0
    );
  end if;

  with open_buy_orders as (
    select id, decision_id
    from public.market_paper_orders
    where organization_id = p_organization_id
      and portfolio_id = p_portfolio_id
      and side = 'BUY'
      and status in ('QUEUED', 'PARTIALLY_FILLED')
    for update
  ),
  cancelled_decisions as (
    update public.market_decisions decision
    set risk_status = 'CANCELLED',
        invalidation_reason = 'PORTFOLIO_CIRCUIT_BREAKER'
    where decision.organization_id = p_organization_id
      and decision.portfolio_id = p_portfolio_id
      and decision.risk_status = 'APPROVED_PAPER'
      and decision.id in (
        select decision_id
        from open_buy_orders
        where decision_id is not null
      )
    returning decision.id
  ),
  cancelled_orders as (
    update public.market_paper_orders paper_order
    set status = 'CANCELLED',
        cancelled_at = now(),
        cancellation_reason = 'PORTFOLIO_CIRCUIT_BREAKER',
        lifecycle_reason = 'PORTFOLIO_CIRCUIT_BREAKER'
    where paper_order.organization_id = p_organization_id
      and paper_order.portfolio_id = p_portfolio_id
      and paper_order.id in (select id from open_buy_orders)
      and paper_order.status in ('QUEUED', 'PARTIALLY_FILLED')
    returning paper_order.id
  )
  select
    (select count(*) from cancelled_orders),
    (select count(*) from cancelled_decisions)
  into v_cancelled_orders, v_cancelled_decisions;

  return jsonb_build_object(
    'cancelled', (v_cancelled_orders > 0 or v_cancelled_decisions > 0),
    'reason', 'PORTFOLIO_CIRCUIT_BREAKER',
    'cancelled_orders', v_cancelled_orders,
    'cancelled_decisions', v_cancelled_decisions
  );
end;
$$;

revoke all on function public.market_cancel_open_paper_buy_authority_on_breaker(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.market_cancel_open_paper_buy_authority_on_breaker(uuid, uuid)
to service_role;

comment on function public.market_cancel_open_paper_buy_authority_on_breaker(uuid, uuid) is
  'When the PAPER portfolio circuit breaker is latched, atomically cancels queued or partial BUY orders and their linked approved decisions under the locked automation-policy row.';

commit;
