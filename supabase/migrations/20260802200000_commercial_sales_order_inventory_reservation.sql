begin;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  item_id uuid not null,
  source_document text not null,
  source_document_id uuid not null,
  source_line_id uuid,
  quantity numeric(18,4) not null,
  status text not null default 'ACTIVE',
  reserved_by uuid not null,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_reservations_quantity_positive check (quantity > 0),
  constraint inventory_reservations_status_check check (
    status in ('ACTIVE', 'RELEASED', 'CONSUMED', 'CANCELLED')
  ),
  constraint inventory_reservations_source_line_unique unique (
    organization_id,
    entity_id,
    source_document,
    source_document_id,
    source_line_id
  )
);

create index if not exists inventory_reservations_item_status_idx
  on public.inventory_reservations (
    organization_id,
    entity_id,
    item_id,
    status
  );

create index if not exists inventory_reservations_source_idx
  on public.inventory_reservations (
    organization_id,
    entity_id,
    source_document,
    source_document_id,
    status
  );

alter table public.inventory_reservations enable row level security;

create or replace function public.commercial_confirm_sales_order_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_sales_order_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders%rowtype;
  v_line record;
  v_available numeric;
  v_reserved numeric;
  v_required numeric;
  v_order_number text;
  v_event_id text;
  v_existing_event jsonb;
  v_existing_event_type text;
  v_reservation_count integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;

  if p_sales_order_id is null then
    raise exception 'sales_order_id required';
  end if;

  if p_actor_id is null then
    raise exception 'authenticated actor required';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':sales-order-confirm:' || btrim(p_idempotency_key),
      0
    )
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':sales-order:' || p_sales_order_id::text,
      0
    )
  );

  select type, payload
  into v_existing_event_type, v_existing_event
  from public.system_events
  where organization_id = p_organization_id
    and idempotency_key = btrim(p_idempotency_key)
  order by created_at asc
  limit 1;

  if found then
    if v_existing_event_type <> 'SALES_ORDER_CONFIRMED'
       or v_existing_event->>'sales_order_id' is distinct from p_sales_order_id::text then
      raise exception 'idempotency_key is already used by another operation';
    end if;

    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'sales_order_id', v_existing_event->>'sales_order_id',
      'order_number', v_existing_event->>'order_number',
      'status', v_existing_event->>'status',
      'fulfillment_status', v_existing_event->>'fulfillment_status',
      'payment_status', v_existing_event->>'payment_status'
    );
  end if;

  select *
  into v_order
  from public.sales_orders
  where id = p_sales_order_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Sales order not found in organization and entity scope';
  end if;

  if v_order.status = 'CONFIRMED' then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'sales_order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'fulfillment_status', v_order.fulfillment_status,
      'payment_status', v_order.payment_status
    );
  end if;

  if v_order.status <> 'DRAFT' then
    raise exception 'Only draft sales orders can be confirmed';
  end if;

  if not exists (
    select 1
    from public.sales_order_lines
    where sales_order_id = v_order.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
  ) then
    raise exception 'Sales order has no lines';
  end if;

  for v_line in
    select item_id, sum(quantity) as quantity
    from public.sales_order_lines
    where sales_order_id = v_order.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
    group by item_id
    order by item_id
  loop
    if v_line.item_id is null then
      raise exception 'Every confirmed sales order line must reference an inventory item';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        p_organization_id::text || ':' ||
        p_entity_id::text || ':inventory-reservation:' ||
        v_line.item_id::text,
        0
      )
    );

    select coalesce(sum(
      case
        when upper(type) in (
          'PURCHASE',
          'GOODS_RECEIPT',
          'PRODUCTION',
          'ADJUSTMENT_IN',
          'TRANSFER_IN'
        ) then quantity
        when upper(type) in (
          'SALE',
          'CONSUMPTION',
          'WASTE',
          'ADJUSTMENT_OUT',
          'TRANSFER_OUT',
          'BATCH_PRODUCTION'
        ) then -quantity
        else quantity
      end
    ), 0)
    into v_available
    from public.inventory_movements
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and item_id = v_line.item_id;

    select coalesce(sum(quantity), 0)
    into v_reserved
    from public.inventory_reservations
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and item_id = v_line.item_id
      and status = 'ACTIVE'
      and not (
        source_document = 'sales_order'
        and source_document_id = v_order.id
      );

    v_required := coalesce(v_line.quantity, 0);

    if v_required <= 0 then
      raise exception 'Sales order item quantity must be positive';
    end if;

    if (v_available - v_reserved) < v_required then
      raise exception 'Insufficient available inventory for item %: required %, available %',
        v_line.item_id,
        v_required,
        greatest(v_available - v_reserved, 0);
    end if;
  end loop;

  v_order_number := public.finance_next_document_number(
    p_organization_id,
    p_entity_id,
    'SALES_ORDER',
    null,
    current_date
  );

  insert into public.inventory_reservations (
    organization_id,
    entity_id,
    item_id,
    source_document,
    source_document_id,
    source_line_id,
    quantity,
    status,
    reserved_by,
    reserved_at,
    metadata
  )
  select
    p_organization_id,
    p_entity_id,
    line.item_id,
    'sales_order',
    v_order.id,
    line.id,
    line.quantity,
    'ACTIVE',
    p_actor_id,
    now(),
    jsonb_build_object(
      'order_number', v_order_number,
      'channel', v_order.channel,
      'application_id', v_order.application_id
    )
  from public.sales_order_lines line
  where line.sales_order_id = v_order.id
    and line.organization_id = p_organization_id
    and line.entity_id = p_entity_id
  on conflict (
    organization_id,
    entity_id,
    source_document,
    source_document_id,
    source_line_id
  ) do update
  set quantity = excluded.quantity,
      status = 'ACTIVE',
      reserved_by = excluded.reserved_by,
      reserved_at = excluded.reserved_at,
      released_at = null,
      consumed_at = null,
      metadata = excluded.metadata,
      updated_at = now();

  get diagnostics v_reservation_count = row_count;

  update public.sales_orders
  set order_number = v_order_number,
      status = 'CONFIRMED',
      fulfillment_status = 'RESERVED',
      confirmed_at = now(),
      updated_at = now()
  where id = v_order.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  returning * into v_order;

  insert into public.system_events (
    organization_id,
    type,
    payload,
    idempotency_key
  ) values (
    p_organization_id,
    'SALES_ORDER_CONFIRMED',
    jsonb_build_object(
      'sales_order_id', v_order.id,
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'fulfillment_status', v_order.fulfillment_status,
      'payment_status', v_order.payment_status,
      'reservation_count', v_reservation_count,
      'total_amount', v_order.total_amount,
      'currency_code', v_order.currency_code
    ),
    btrim(p_idempotency_key)
  )
  returning id::text into v_event_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'sales_order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'fulfillment_status', v_order.fulfillment_status,
    'payment_status', v_order.payment_status,
    'reservation_count', v_reservation_count,
    'event_id', v_event_id,
    'event_type', 'SALES_ORDER_CONFIRMED'
  );
end;
$$;

revoke all on function public.commercial_confirm_sales_order_atomic(
  uuid, uuid, uuid, uuid, text
) from public;

grant execute on function public.commercial_confirm_sales_order_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;

comment on table public.inventory_reservations is
  'Canonical entity-scoped inventory commitments created by confirmed commercial documents.';

comment on function public.commercial_confirm_sales_order_atomic(
  uuid, uuid, uuid, uuid, text
) is
  'Confirms one draft sales order, reserves available inventory under deterministic item locks, assigns a configured document number, and records an idempotent system event.';

notify pgrst, 'reload schema';

commit;