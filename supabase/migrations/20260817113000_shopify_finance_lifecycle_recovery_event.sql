begin;

create or replace function public.claim_shopify_finance_lifecycle_events(
  p_limit integer default 25,
  p_stale_after_seconds integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_stale_seconds integer := greatest(30, coalesce(p_stale_after_seconds, 300));
  v_events jsonb;
begin
  with candidates as (
    select event.id
    from public.system_events event
    where event.type in (
      'SHOPIFY_ORDER_PAID_OBSERVED',
      'SHOPIFY_ORDER_TRANSACTION_OBSERVED',
      'SHOPIFY_ORDER_FULFILLED_OBSERVED',
      'SHOPIFY_ORDER_PARTIALLY_FULFILLED_OBSERVED',
      'SHOPIFY_FULFILLMENT_OBSERVED',
      'SHOPIFY_REFUND_OBSERVED',
      'SHOPIFY_ORDER_LIFECYCLE_RECONCILIATION_REQUESTED'
    )
      and coalesce(event.processed, false) = false
      and (
        coalesce(event.processing, false) = false
        or event.processing_started_at is null
        or event.processing_started_at < now() - make_interval(secs => v_stale_seconds)
      )
      and coalesce(event.attempt_count, 0) < 8
    order by event.created_at asc
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.system_events event
    set processing = true,
        processing_started_at = now(),
        attempt_count = coalesce(event.attempt_count, 0) + 1,
        last_error = null
    from candidates
    where event.id = candidates.id
    returning event.*
  )
  select coalesce(
    jsonb_agg(to_jsonb(claimed) order by claimed.created_at asc),
    '[]'::jsonb
  )
  into v_events
  from claimed;

  return v_events;
end;
$$;

revoke all on function public.claim_shopify_finance_lifecycle_events(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_shopify_finance_lifecycle_events(integer, integer)
  to service_role;

commit;
