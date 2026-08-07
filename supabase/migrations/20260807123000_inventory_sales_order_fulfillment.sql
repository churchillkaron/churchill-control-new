begin;

create or replace function public.inventory_signed_quantity(
  p_type text,
  p_quantity numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when upper(btrim(coalesce(p_type, ''))) in (
      'PURCHASE',
      'GOODS_RECEIPT',
      'PRODUCTION',
      'ADJUSTMENT_IN',
      'TRANSFER_IN',
      'PUTAWAY'
    ) then coalesce(p_quantity, 0)
    when upper(btrim(coalesce(p_type, ''))) in (
      'SALE',
      'CONSUMPTION',
      'WASTE',
      'ADJUSTMENT_OUT',
      'TRANSFER_OUT',
      'BATCH_PRODUCTION',
      'USAGE'
    ) then -coalesce(p_quantity, 0)
    else 0
  end;
$$;

revoke all on function public.inventory_signed_quantity(text, numeric) from public;
grant execute on function public.inventory_signed_quantity(text, numeric) to service_role;

create or replace function public.inventory_fulfill_sales_order_atomic(
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
  v_existing_event jsonb;
  v_existing_event_type text;
  v_reservation record;
  v_position record;
  v_layer record;
  v_document_id uuid;
  v_movement_id uuid;
  v_required numeric;
  v_remaining numeric;
  v_position_take numeric;
  v_layer_take numeric;
  v_item_cost numeric;
  v_item_unit_cost numeric;
  v_available numeric;
  v_position_balance numeric;
  v_global_balance numeric;
  v_global_value numeric;
  v_average_unit_cost numeric;
  v_consumed_reservations integer := 0;
  v_created_movements integer := 0;
  v_event_id text;
  v_result jsonb;
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
      p_organization_id::text || ':' ||
      p_entity_id::text || ':sales-order-fulfillment:' ||
      p_sales_order_id::text,
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
    if v_existing_event_type <> 'SALES_ORDER_FULFILLED'
       or v_existing_event->>'sales_order_id' is distinct from p_sales_order_id::text then
      raise exception 'idempotency_key is already used by another operation';
    end if;

    return v_existing_event || jsonb_build_object(
      'success', true,
      'duplicate', true
    );
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id
    and coalesce(is_active, true) = true;

  if not found then
    raise exception 'Entity is outside organization scope or inactive';
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

  if upper(coalesce(v_order.status, '')) = 'FULFILLED'
     and upper(coalesce(v_order.fulfillment_status, '')) = 'FULFILLED' then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'sales_order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'payment_status', v_order.payment_status,
      'fulfillment_status', v_order.fulfillment_status
    );
  end if;

  if lower(coalesce(v_order.application_id, '')) <> 'retail' then
    raise exception 'Only Retail sales orders are supported by this fulfillment contract';
  end if;

  if upper(coalesce(v_order.status, '')) <> 'CONFIRMED' then
    raise exception 'Only confirmed sales orders can be fulfilled';
  end if;

  if upper(coalesce(v_order.payment_status, '')) <> 'PAID' then
    raise exception 'Sales order must be fully paid before fulfillment';
  end if;

  if upper(coalesce(v_order.fulfillment_status, '')) <> 'RESERVED' then
    raise exception 'Sales order inventory must be reserved before fulfillment';
  end if;

  if exists (
    select 1
    from public.sales_order_lines line
    where line.sales_order_id = v_order.id
      and line.organization_id = p_organization_id
      and line.entity_id = p_entity_id
      and (
        line.item_id is null
        or not exists (
          select 1
          from public.inventory_reservations reservation
          where reservation.organization_id = p_organization_id
            and reservation.entity_id = p_entity_id
            and reservation.source_document = 'sales_order'
            and reservation.source_document_id = v_order.id
            and reservation.source_line_id = line.id
            and reservation.item_id = line.item_id
            and reservation.status = 'ACTIVE'
            and reservation.quantity >= line.quantity
        )
      )
  ) then
    raise exception 'Sales order inventory reservation is incomplete';
  end if;

  for v_reservation in
    select
      reservation.*,
      line.quantity as line_quantity
    from public.inventory_reservations reservation
    join public.sales_order_lines line
      on line.id = reservation.source_line_id
     and line.sales_order_id = reservation.source_document_id
     and line.organization_id = reservation.organization_id
     and line.entity_id = reservation.entity_id
    where reservation.organization_id = p_organization_id
      and reservation.entity_id = p_entity_id
      and reservation.source_document = 'sales_order'
      and reservation.source_document_id = v_order.id
      and reservation.status = 'ACTIVE'
    order by reservation.item_id, reservation.source_line_id
    for update of reservation
  loop
    v_required := coalesce(v_reservation.line_quantity, 0);

    if v_required <= 0 then
      raise exception 'Reserved sales-order quantity must be positive';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        p_organization_id::text || ':' ||
        p_entity_id::text || ':inventory-item:' ||
        v_reservation.item_id::text,
        0
      )
    );

    select coalesce(sum(public.inventory_signed_quantity(type, quantity)), 0)
    into v_available
    from public.inventory_movements
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and item_id = v_reservation.item_id;

    if v_available < v_required then
      raise exception 'Insufficient physical inventory to fulfill item %: required %, available %',
        v_reservation.item_id,
        v_required,
        greatest(v_available, 0);
    end if;

    v_remaining := v_required;
    v_item_cost := 0;

    for v_layer in
      select *
      from public.inventory_cost_layers
      where organization_id = p_organization_id
        and entity_id = p_entity_id
        and item_id = v_reservation.item_id
        and coalesce(quantity_remaining, 0) > 0
      order by received_at asc nulls last, id asc
      for update
    loop
      exit when v_remaining <= 0;

      v_layer_take := least(
        v_remaining,
        coalesce(v_layer.quantity_remaining, 0)
      );

      if v_layer_take <= 0 then
        continue;
      end if;

      update public.inventory_cost_layers
      set quantity_remaining = quantity_remaining - v_layer_take
      where id = v_layer.id
        and organization_id = p_organization_id
        and entity_id = p_entity_id;

      v_item_cost := v_item_cost + (
        v_layer_take * coalesce(v_layer.unit_cost, 0)
      );

      v_remaining := v_remaining - v_layer_take;
    end loop;

    if v_remaining > 0 then
      raise exception 'Insufficient inventory cost layers to fulfill item %: missing quantity %',
        v_reservation.item_id,
        v_remaining;
    end if;

    v_item_unit_cost := case
      when v_required > 0 then v_item_cost / v_required
      else 0
    end;

    v_remaining := v_required;

    for v_position in
      with position_balances as (
        select
          warehouse_id,
          location_id,
          sum(public.inventory_signed_quantity(type, quantity)) as quantity
        from public.inventory_movements
        where organization_id = p_organization_id
          and entity_id = p_entity_id
          and item_id = v_reservation.item_id
        group by warehouse_id, location_id
      )
      select warehouse_id, location_id, quantity
      from position_balances
      where quantity > 0
      order by
        case when warehouse_id is null then 1 else 0 end,
        warehouse_id nulls last,
        case when location_id is null then 1 else 0 end,
        location_id nulls last
    loop
      exit when v_remaining <= 0;

      v_position_take := least(v_remaining, v_position.quantity);

      if v_position_take <= 0 then
        continue;
      end if;

      insert into public.inventory_documents (
        organization_id,
        entity_id,
        document_type,
        status,
        movement_type,
        item_id,
        warehouse_id,
        location_id,
        quantity,
        unit_cost,
        total_cost,
        source_module,
        source_document,
        source_document_id,
        movement_date,
        notes,
        created_by
      ) values (
        p_organization_id,
        p_entity_id,
        'INVENTORY_MOVEMENT',
        'POSTED',
        'SALE',
        v_reservation.item_id,
        v_position.warehouse_id,
        v_position.location_id,
        v_position_take,
        v_item_unit_cost,
        round(v_position_take * v_item_unit_cost, 4),
        'inventory',
        'sales_order',
        v_order.id,
        now(),
        'Retail sales-order fulfillment',
        p_actor_id
      )
      returning id into v_document_id;

      insert into public.inventory_movements (
        organization_id,
        entity_id,
        document_id,
        item_id,
        warehouse_id,
        location_id,
        quantity,
        type,
        unit_cost,
        total_cost,
        notes,
        reference_id,
        movement_date,
        source_module,
        source_document,
        source_document_id
      ) values (
        p_organization_id,
        p_entity_id,
        v_document_id,
        v_reservation.item_id,
        v_position.warehouse_id,
        v_position.location_id,
        v_position_take,
        'SALE',
        v_item_unit_cost,
        round(v_position_take * v_item_unit_cost, 4),
        'Retail sales-order fulfillment',
        v_order.id,
        now(),
        'inventory',
        'sales_order',
        v_order.id
      )
      returning id into v_movement_id;

      v_created_movements := v_created_movements + 1;
      v_remaining := v_remaining - v_position_take;

      select coalesce(sum(public.inventory_signed_quantity(type, quantity)), 0)
      into v_position_balance
      from public.inventory_movements
      where organization_id = p_organization_id
        and entity_id = p_entity_id
        and item_id = v_reservation.item_id
        and warehouse_id is not distinct from v_position.warehouse_id
        and location_id is not distinct from v_position.location_id;

      insert into public.inventory_ledger (
        organization_id,
        entity_id,
        document_id,
        movement_id,
        item_id,
        warehouse_id,
        location_id,
        movement_type,
        quantity,
        previous_quantity,
        new_quantity,
        reference_type,
        reference_id,
        unit_cost,
        total_cost,
        movement_date
      ) values (
        p_organization_id,
        p_entity_id,
        v_document_id,
        v_movement_id,
        v_reservation.item_id,
        v_position.warehouse_id,
        v_position.location_id,
        'LEDGER_RECALCULATION',
        v_position_balance,
        v_position_balance + v_position_take,
        v_position_balance,
        'INVENTORY_MOVEMENT',
        v_movement_id,
        v_item_unit_cost,
        v_position_balance * v_item_unit_cost,
        now()
      );
    end loop;

    if v_remaining > 0 then
      raise exception 'Unable to allocate fulfillment quantity across physical stock positions for item %',
        v_reservation.item_id;
    end if;

    select
      coalesce(sum(public.inventory_signed_quantity(type, quantity)), 0),
      coalesce(sum(public.inventory_signed_quantity(type, quantity) * coalesce(unit_cost, 0)), 0)
    into v_global_balance, v_global_value
    from public.inventory_movements
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and item_id = v_reservation.item_id;

    update public.inventory_items
    set quantity = v_global_balance
    where id = v_reservation.item_id
      and organization_id = p_organization_id;

    select case
      when coalesce(sum(quantity_remaining), 0) > 0 then
        coalesce(sum(quantity_remaining * unit_cost), 0) /
        sum(quantity_remaining)
      else 0
    end
    into v_average_unit_cost
    from public.inventory_cost_layers
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and item_id = v_reservation.item_id
      and coalesce(quantity_remaining, 0) > 0;

    insert into public.inventory_valuation_snapshots (
      organization_id,
      entity_id,
      item_id,
      quantity_on_hand,
      inventory_value,
      average_unit_cost,
      snapshot_date
    )
    select
      p_organization_id,
      p_entity_id,
      v_reservation.item_id,
      coalesce(sum(quantity_remaining), 0),
      coalesce(sum(quantity_remaining * unit_cost), 0),
      coalesce(v_average_unit_cost, 0),
      now()
    from public.inventory_cost_layers
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and item_id = v_reservation.item_id;

    update public.inventory_reservations
    set status = 'CONSUMED',
        consumed_at = now(),
        updated_at = now()
    where id = v_reservation.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and status = 'ACTIVE';

    if not found then
      raise exception 'Inventory reservation changed during fulfillment';
    end if;

    v_consumed_reservations := v_consumed_reservations + 1;
  end loop;

  if v_consumed_reservations = 0 then
    raise exception 'No active sales-order reservations were available for fulfillment';
  end if;

  if exists (
    select 1
    from public.inventory_reservations
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and source_document = 'sales_order'
      and source_document_id = v_order.id
      and status = 'ACTIVE'
  ) then
    raise exception 'Active sales-order reservations remain after fulfillment';
  end if;

  update public.sales_orders
  set status = 'FULFILLED',
      fulfillment_status = 'FULFILLED',
      updated_at = now()
  where id = v_order.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and status = 'CONFIRMED'
    and payment_status = 'PAID'
    and fulfillment_status = 'RESERVED'
  returning * into v_order;

  if not found then
    raise exception 'Sales order fulfillment status update failed';
  end if;

  insert into public.system_events (
    organization_id,
    type,
    payload,
    idempotency_key
  ) values (
    p_organization_id,
    'SALES_ORDER_FULFILLED',
    jsonb_build_object(
      'sales_order_id', v_order.id,
      'order_number', v_order.order_number,
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'application_id', v_order.application_id,
      'status', v_order.status,
      'payment_status', v_order.payment_status,
      'fulfillment_status', v_order.fulfillment_status,
      'consumed_reservations', v_consumed_reservations,
      'inventory_movements_created', v_created_movements
    ),
    btrim(p_idempotency_key)
  )
  returning id::text into v_event_id;

  v_result := jsonb_build_object(
    'success', true,
    'duplicate', false,
    'sales_order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'fulfillment_status', v_order.fulfillment_status,
    'consumed_reservations', v_consumed_reservations,
    'inventory_movements_created', v_created_movements,
    'event_id', v_event_id,
    'event_type', 'SALES_ORDER_FULFILLED'
  );

  return v_result;
end;
$$;

revoke all on function public.inventory_fulfill_sales_order_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) from public;

grant execute on function public.inventory_fulfill_sales_order_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) to service_role;

comment on function public.inventory_fulfill_sales_order_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) is
  'Atomically fulfills one fully-paid Retail sales order by consuming active reservations and cost layers, allocating canonical SALE movements across physical stock positions, updating inventory projections, and completing fulfillment.';

notify pgrst, 'reload schema';

commit;
