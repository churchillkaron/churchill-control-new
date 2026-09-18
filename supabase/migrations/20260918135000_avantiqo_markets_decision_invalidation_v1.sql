begin;

alter table public.market_decisions
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidation_reason text,
  add column if not exists superseded_by_decision_id uuid references public.market_decisions(id) on delete restrict;

alter table public.market_decisions
  drop constraint if exists market_decision_risk_status_check;
alter table public.market_decisions
  add constraint market_decision_risk_status_check
  check (risk_status in ('PENDING','APPROVED_PAPER','REJECTED','EXPIRED','CANCELLED','SUPERSEDED'));

alter table public.market_paper_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

create or replace function public.market_invalidate_paper_decision(
  p_organization_id uuid,
  p_portfolio_id uuid,
  p_decision_id uuid,
  p_reason text,
  p_superseded_by_decision_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_decision public.market_decisions%rowtype;  v_replacement public.market_decisions%rowtype;
  v_status text;
  v_cancelled integer := 0;
  v_now timestamptz := now();
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'PAPER_DECISION_INVALIDATION_REASON_REQUIRED';
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

  if v_decision.risk_status in ('CANCELLED','SUPERSEDED','EXPIRED','REJECTED') then
    return jsonb_build_object(
      'decision_id', v_decision.id,
      'risk_status', v_decision.risk_status,
      'orders_cancelled', 0,
      'already_terminal', true
    );
  end if;

  if p_superseded_by_decision_id is not null then
    select * into v_replacement
    from public.market_decisions    where id = p_superseded_by_decision_id
      and organization_id = p_organization_id
      and portfolio_id = p_portfolio_id
    for update;

    if not found then
      raise exception 'PAPER_REPLACEMENT_DECISION_NOT_FOUND';
    end if;
    if v_replacement.id = v_decision.id then
      raise exception 'PAPER_DECISION_CANNOT_SUPERSEDE_ITSELF';
    end if;
    if upper(v_replacement.symbol) <> upper(v_decision.symbol) then
      raise exception 'PAPER_DECISION_SUPERSESSION_SYMBOL_MISMATCH';
    end if;
    if v_replacement.risk_status <> 'APPROVED_PAPER' then
      raise exception 'PAPER_REPLACEMENT_DECISION_NOT_APPROVED';
    end if;
    v_status := 'SUPERSEDED';
  else
    v_status := 'CANCELLED';
  end if;

  update public.market_decisions
  set risk_status = v_status,
      invalidated_at = v_now,
      invalidation_reason = btrim(p_reason),
      superseded_by_decision_id = p_superseded_by_decision_id
  where id = v_decision.id;

  update public.market_paper_orders
  set status = 'CANCELLED',
      cancelled_at = coalesce(cancelled_at, v_now),      cancellation_reason = case
        when v_status = 'SUPERSEDED' then 'GOVERNED_DECISION_SUPERSEDED'
        else 'GOVERNED_DECISION_CANCELLED'
      end,
      lifecycle_reason = case
        when v_status = 'SUPERSEDED' then 'GOVERNED_DECISION_SUPERSEDED'
        else 'GOVERNED_DECISION_CANCELLED'
      end
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
    and decision_id = v_decision.id
    and status in ('QUEUED','PARTIALLY_FILLED');

  get diagnostics v_cancelled = row_count;

  return jsonb_build_object(
    'decision_id', v_decision.id,
    'risk_status', v_status,
    'invalidated_at', v_now,
    'invalidation_reason', btrim(p_reason),
    'superseded_by_decision_id', p_superseded_by_decision_id,
    'orders_cancelled', v_cancelled,
    'already_terminal', false
  );
end;
$$;

revoke all on function public.market_invalidate_paper_decision(uuid, uuid, uuid, text, uuid)
from public, anon, authenticated;grant execute on function public.market_invalidate_paper_decision(uuid, uuid, uuid, text, uuid)
to service_role;

comment on function public.market_invalidate_paper_decision(uuid, uuid, uuid, text, uuid) is
  'Atomically cancels or supersedes one exact governed PAPER decision and cancels only its remaining queued or partially-filled order quantity.';

commit;
