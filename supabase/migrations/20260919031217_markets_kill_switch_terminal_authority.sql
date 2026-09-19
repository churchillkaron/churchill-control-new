begin;

create or replace function public.market_cancel_open_paper_authority_on_kill_switch(
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

  if v_policy.kill_switch is not true then
    return jsonb_build_object(
      'cancelled', false,
      'reason', 'KILL_SWITCH_NOT_ACTIVE',
      'cancelled_orders', 0,
      'cancelled_decisions', 0
    );
  end if;

  with open_orders as (
    select id, decision_id
    from public.market_paper_orders
    where organization_id = p_organization_id
      and portfolio_id = p_portfolio_id
      and status in ('QUEUED', 'PARTIALLY_FILLED')
    for update
  ),
  cancelled_decisions as (
    update public.market_decisions decision
    set risk_status = 'CANCELLED',
        invalidation_reason = 'PAPER_AUTOMATION_KILL_SWITCH_ACTIVATED'
    where decision.organization_id = p_organization_id
      and decision.portfolio_id = p_portfolio_id
      and decision.risk_status = 'APPROVED_PAPER'
      and decision.id in (
        select decision_id
        from open_orders
        where decision_id is not null
      )
    returning decision.id
  ),
  cancelled_orders as (
    update public.market_paper_orders paper_order
    set status = 'CANCELLED',
        cancelled_at = now(),
        cancellation_reason = 'PAPER_AUTOMATION_KILL_SWITCH_ACTIVATED',
        lifecycle_reason = 'PAPER_AUTOMATION_KILL_SWITCH_ACTIVATED'
    where paper_order.organization_id = p_organization_id
      and paper_order.portfolio_id = p_portfolio_id
      and paper_order.id in (select id from open_orders)
      and paper_order.status in ('QUEUED', 'PARTIALLY_FILLED')
    returning paper_order.id
  )
  select
    (select count(*) from cancelled_orders),
    (select count(*) from cancelled_decisions)
  into v_cancelled_orders, v_cancelled_decisions;

  return jsonb_build_object(
    'cancelled', true,
    'reason', 'PAPER_AUTOMATION_KILL_SWITCH_ACTIVATED',
    'cancelled_orders', v_cancelled_orders,
    'cancelled_decisions', v_cancelled_decisions
  );
end;
$$;

revoke all on function public.market_cancel_open_paper_authority_on_kill_switch(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.market_cancel_open_paper_authority_on_kill_switch(uuid, uuid)
to service_role;

comment on function public.market_cancel_open_paper_authority_on_kill_switch(uuid, uuid) is
  'When the PAPER automation kill switch is active, locks the policy row and atomically cancels all queued or partially filled PAPER orders plus their approved decisions.';

commit;
