begin;

insert into public.provider_pricing (
  provider,
  model,
  capability,
  unit,
  cost_per_unit,
  currency,
  active,
  metadata,
  created_at,
  updated_at
)
select
  'shopify',
  'commerce.shopify.order.lifecycle.read',
  'commerce.shopify.order.lifecycle.read',
  'request',
  0,
  null,
  true,
  jsonb_build_object(
    'cost_scope', 'AVANTIQO_API_EXECUTION_ONLY',
    'managed_by', 'avantiqo',
    'pricing_mode', 'ZERO_PRICE',
    'allow_zero_price', true,
    'currency_neutral', true,
    'configured_reason', 'Avantiqo API execution is not separately charged; Shopify subscription, transaction, application, or external provider charges remain customer/provider governed.',
    'supplier_billing_required', false,
    'customer_provider_account_required', true,
    'external_provider_charges_excluded', true
  ),
  now(),
  now()
where not exists (
  select 1
  from public.provider_pricing pricing
  where lower(pricing.provider) = 'shopify'
    and pricing.capability = 'commerce.shopify.order.lifecycle.read'
    and pricing.unit = 'request'
    and pricing.active is true
);

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
      'SHOPIFY_REFUND_OBSERVED'
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

create or replace function public.commercial_sync_external_sales_order_lifecycle_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_source_reference text,
  p_status text,
  p_payment_status text,
  p_fulfillment_status text,
  p_paid_amount numeric,
  p_remaining_balance numeric,
  p_credited_amount numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.sales_orders%rowtype;
  v_total numeric;
  v_paid numeric;
  v_remaining numeric;
  v_credited numeric;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;
  if nullif(btrim(coalesce(p_source_reference, '')), '') is null then
    raise exception 'source_reference required';
  end if;
  if upper(coalesce(p_status, '')) not in (
    'DRAFT','CONFIRMED','PARTIALLY_FULFILLED','FULFILLED','CANCELLED','CLOSED'
  ) then
    raise exception 'Invalid sales order status';
  end if;
  if upper(coalesce(p_payment_status, '')) not in (
    'UNPAID','PARTIALLY_PAID','PAID','REFUNDED','VOID'
  ) then
    raise exception 'Invalid payment status';
  end if;
  if upper(coalesce(p_fulfillment_status, '')) not in (
    'NOT_STARTED','RESERVED','PARTIALLY_FULFILLED','FULFILLED','CANCELLED'
  ) then
    raise exception 'Invalid fulfillment status';
  end if;

  select *
  into v_order
  from public.sales_orders
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and source_reference = p_source_reference
  for update;

  if not found then
    raise exception 'External sales order not found in organization and entity scope';
  end if;

  v_total := greatest(coalesce(v_order.total_amount, 0), 0);
  v_paid := greatest(coalesce(p_paid_amount, 0), 0);
  v_remaining := greatest(coalesce(p_remaining_balance, 0), 0);
  v_credited := greatest(coalesce(p_credited_amount, 0), 0);

  if v_paid > v_total + v_credited + 0.005 then
    raise exception 'External sales order paid amount exceeds supported lifecycle total';
  end if;
  if v_remaining > v_total + 0.005 then
    raise exception 'External sales order remaining balance exceeds order total';
  end if;

  update public.sales_orders
  set status = upper(p_status),
      payment_status = upper(p_payment_status),
      fulfillment_status = upper(p_fulfillment_status),
      paid_amount = v_paid,
      remaining_balance = v_remaining,
      credited_amount = v_credited,
      cancelled_at = case
        when upper(p_status) = 'CANCELLED' then coalesce(cancelled_at, now())
        else cancelled_at
      end,
      updated_at = now()
  where id = v_order.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  returning * into v_order;

  return jsonb_build_object(
    'success', true,
    'sales_order_id', v_order.id,
    'organization_id', v_order.organization_id,
    'entity_id', v_order.entity_id,
    'source_reference', v_order.source_reference,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'fulfillment_status', v_order.fulfillment_status,
    'paid_amount', v_order.paid_amount,
    'remaining_balance', v_order.remaining_balance,
    'credited_amount', v_order.credited_amount
  );
end;
$$;

revoke all on function public.commercial_sync_external_sales_order_lifecycle_atomic(
  uuid,uuid,text,text,text,text,numeric,numeric,numeric
) from public, anon, authenticated;
grant execute on function public.commercial_sync_external_sales_order_lifecycle_atomic(
  uuid,uuid,text,text,text,text,numeric,numeric,numeric
) to service_role;

commit;
