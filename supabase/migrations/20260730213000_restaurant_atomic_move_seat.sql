begin;

create or replace function public.restaurant_move_seat_atomic(
  p_organization_id uuid,
  p_from_table_id uuid,
  p_to_table_id uuid,
  p_seat_position integer,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_source_table public.restaurant_tables%rowtype;
  v_target_table public.restaurant_tables%rowtype;
  v_source_session public.table_sessions%rowtype;
  v_target_session public.table_sessions%rowtype;
  v_target_order public.orders%rowtype;
  v_order record;
  v_source_order_ids uuid[];
  v_source_session_ids uuid[];
  v_affected_session_ids uuid[];
  v_item_ids uuid[];
  v_item_count integer := 0;
  v_allocated_item_count integer := 0;
  v_source_remaining_item_count integer := 0;
  v_source_guest_before integer := 1;
  v_source_guest_after integer := 0;
  v_target_guest_before integer := 0;
  v_target_order_created boolean := false;
  v_target_session_created boolean := false;
  v_seed_subtotal numeric := 0;
  v_seed_service_rate numeric := 0;
  v_seed_tax_rate numeric := 0;
  v_seed_discount_rate numeric := 0;
  v_order_service_rate numeric := 0;
  v_order_tax_rate numeric := 0;
  v_order_discount_rate numeric := 0;
  v_new_subtotal numeric(18,2) := 0;
  v_new_service numeric(18,2) := 0;
  v_new_tax numeric(18,2) := 0;
  v_new_discount numeric(18,2) := 0;
  v_new_total numeric(18,2) := 0;
  v_target_total numeric(18,2) := 0;
  v_source_totals jsonb := '{}'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'organizationId required';
  end if;

  if p_from_table_id is null then
    raise exception 'fromTableId required';
  end if;

  if p_to_table_id is null then
    raise exception 'toTableId required';
  end if;

  if p_from_table_id = p_to_table_id then
    raise exception 'Cannot move a seat to the same table';
  end if;

  if coalesce(p_seat_position, 0) < 1 then
    raise exception 'seatPosition must be a positive integer';
  end if;

  perform 1
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = any(array[p_from_table_id, p_to_table_id])
  order by id
  for update;

  select *
  into v_source_table
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_from_table_id;

  if not found then
    raise exception 'Source table not found';
  end if;

  select *
  into v_target_table
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_to_table_id;

  if not found then
    raise exception 'Target table not found';
  end if;

  if upper(coalesce(v_target_table.status, '')) = 'MERGED' then
    raise exception 'Target table is merged into another table';
  end if;

  select array_agg(id order by created_at, id),
         array_remove(array_agg(distinct session_id), null)
  into v_source_order_ids, v_source_session_ids
  from public.orders
  where organization_id = p_organization_id
    and table_id = p_from_table_id
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED');

  if coalesce(array_length(v_source_order_ids, 1), 0) = 0 then
    raise exception 'No active source orders found';
  end if;

  perform 1
  from public.orders
  where organization_id = p_organization_id
    and id = any(v_source_order_ids)
  order by id
  for update;

  if exists (
    select 1
    from public.orders
    where organization_id = p_organization_id
      and id = any(v_source_order_ids)
      and (
        coalesce(amount_paid, 0) > 0
        or upper(coalesce(payment_status, 'UNPAID')) in ('PARTIAL', 'PARTIALLY_PAID', 'PAID')
      )
  ) then
    raise exception 'Cannot move a seat after payment has started';
  end if;

  select array_agg(oi.id order by oi.created_at, oi.id), count(*)
  into v_item_ids, v_item_count
  from public.order_items oi
  where oi.organization_id = p_organization_id
    and oi.order_id = any(v_source_order_ids)
    and coalesce(oi.seat_position::text, oi.modifiers->>'seat') = p_seat_position::text;

  if coalesce(v_item_count, 0) = 0 then
    raise exception 'No active order items found for seat %', p_seat_position;
  end if;

  perform 1
  from public.order_items
  where organization_id = p_organization_id
    and id = any(v_item_ids)
  order by id
  for update;

  select count(*)
  into v_allocated_item_count
  from public.restaurant_payment_allocations
  where organization_id = p_organization_id
    and allocation_type = 'ITEM'
    and order_item_id = any(v_item_ids);

  if v_allocated_item_count > 0 then
    raise exception 'Cannot move a seat containing settled items';
  end if;

  select *
  into v_source_session
  from public.table_sessions
  where organization_id = p_organization_id
    and (
      id = v_source_table.active_session_id
      or table_id = p_from_table_id
    )
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by
    case when id = v_source_table.active_session_id then 0 else 1 end,
    created_at desc
  limit 1
  for update;

  select *
  into v_target_session
  from public.table_sessions
  where organization_id = p_organization_id
    and (
      id = v_target_table.active_session_id
      or table_id = p_to_table_id
    )
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by
    case when id = v_target_table.active_session_id then 0 else 1 end,
    created_at desc
  limit 1
  for update;

  if v_target_session.id is null then
    insert into public.table_sessions (
      organization_id,
      customer_id,
      customer_name,
      customer_email,
      customer_phone,
      table_id,
      table_number,
      guest_count,
      guests,
      status,
      revenue,
      orders,
      started_at,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_source_session.customer_id,
      v_source_session.customer_name,
      v_source_session.customer_email,
      v_source_session.customer_phone,
      p_to_table_id,
      v_target_table.table_number,
      1,
      1,
      'OPEN',
      0,
      0,
      v_now,
      v_now,
      v_now
    )
    returning * into v_target_session;

    v_target_session_created := true;
  else
    v_target_guest_before := greatest(
      coalesce(v_target_table.current_guests, 0),
      coalesce(v_target_session.guest_count, 0),
      coalesce(v_target_session.guests, 0)
    );

    update public.table_sessions
    set guest_count = v_target_guest_before + 1,
        guests = v_target_guest_before + 1,
        updated_at = v_now
    where organization_id = p_organization_id
      and id = v_target_session.id
    returning * into v_target_session;
  end if;

  select *
  into v_target_order
  from public.orders
  where organization_id = p_organization_id
    and table_id = p_to_table_id
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED')
  order by created_at desc
  limit 1
  for update;

  if v_target_order.id is not null and (
    coalesce(v_target_order.amount_paid, 0) > 0
    or upper(coalesce(v_target_order.payment_status, 'UNPAID')) in ('PARTIAL', 'PARTIALLY_PAID', 'PAID')
  ) then
    raise exception 'Cannot move a seat into an order after payment has started';
  end if;

  select
    round(coalesce(sum(coalesce(subtotal, 0)), 0)::numeric, 2),
    coalesce(
      sum(coalesce(service_charge_amount, 0)) /
      nullif(sum(coalesce(subtotal, 0)), 0),
      0
    ),
    coalesce(
      sum(coalesce(vat_amount, 0)) /
      nullif(sum(coalesce(subtotal, 0)), 0),
      0
    ),
    coalesce(
      sum(coalesce(discount_amount, 0)) /
      nullif(sum(coalesce(subtotal, 0)), 0),
      0
    )
  into
    v_seed_subtotal,
    v_seed_service_rate,
    v_seed_tax_rate,
    v_seed_discount_rate
  from public.orders
  where organization_id = p_organization_id
    and id = any(v_source_order_ids);

  if v_target_order.id is null then
    select *
    into v_order
    from public.orders
    where organization_id = p_organization_id
      and id = v_source_order_ids[1];

    insert into public.orders (
      organization_id,
      session_id,
      table_id,
      table_number,
      customer_id,
      customer_name,
      staff_id,
      staff_name,
      status,
      payment_status,
      production_status,
      subtotal,
      service_charge_amount,
      vat_amount,
      discount_amount,
      total,
      total_amount,
      amount_paid,
      remaining_balance,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_target_session.id,
      p_to_table_id,
      v_target_table.table_number,
      v_order.customer_id,
      v_order.customer_name,
      coalesce(p_actor_id, v_order.staff_id),
      v_order.staff_name,
      'OPEN',
      'UNPAID',
      coalesce(v_order.production_status, 'PENDING'),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      v_now,
      v_now
    )
    returning * into v_target_order;

    v_target_order_created := true;
    v_order_service_rate := v_seed_service_rate;
    v_order_tax_rate := v_seed_tax_rate;
    v_order_discount_rate := v_seed_discount_rate;
  else
    v_order_service_rate := case
      when coalesce(v_target_order.subtotal, 0) > 0
        then coalesce(v_target_order.service_charge_amount, 0) / v_target_order.subtotal
      else v_seed_service_rate
    end;
    v_order_tax_rate := case
      when coalesce(v_target_order.subtotal, 0) > 0
        then coalesce(v_target_order.vat_amount, 0) / v_target_order.subtotal
      else v_seed_tax_rate
    end;
    v_order_discount_rate := case
      when coalesce(v_target_order.subtotal, 0) > 0
        then coalesce(v_target_order.discount_amount, 0) / v_target_order.subtotal
      else v_seed_discount_rate
    end;

    update public.orders
    set session_id = v_target_session.id,
        updated_at = v_now
    where organization_id = p_organization_id
      and id = v_target_order.id;
  end if;

  update public.order_items
  set order_id = v_target_order.id,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = any(v_item_ids);

  for v_order in
    select
      id,
      subtotal,
      service_charge_amount,
      vat_amount,
      discount_amount
    from public.orders
    where organization_id = p_organization_id
      and id = any(v_source_order_ids)
    order by id
  loop
    select round(coalesce(sum(coalesce(price, 0) * coalesce(quantity, 1)), 0)::numeric, 2)
    into v_new_subtotal
    from public.order_items
    where organization_id = p_organization_id
      and order_id = v_order.id;

    v_new_service := round(
      v_new_subtotal * case
        when coalesce(v_order.subtotal, 0) > 0
          then coalesce(v_order.service_charge_amount, 0) / v_order.subtotal
        else 0
      end,
      2
    );
    v_new_tax := round(
      v_new_subtotal * case
        when coalesce(v_order.subtotal, 0) > 0
          then coalesce(v_order.vat_amount, 0) / v_order.subtotal
        else 0
      end,
      2
    );
    v_new_discount := round(
      v_new_subtotal * case
        when coalesce(v_order.subtotal, 0) > 0
          then coalesce(v_order.discount_amount, 0) / v_order.subtotal
        else 0
      end,
      2
    );
    v_new_total := greatest(
      0,
      round((v_new_subtotal + v_new_service + v_new_tax - v_new_discount)::numeric, 2)
    );

    update public.orders
    set subtotal = v_new_subtotal,
        service_charge_amount = v_new_service,
        vat_amount = v_new_tax,
        discount_amount = v_new_discount,
        total = v_new_total,
        total_amount = v_new_total,
        amount_paid = 0,
        remaining_balance = v_new_total,
        payment_status = 'UNPAID',
        updated_at = v_now
    where organization_id = p_organization_id
      and id = v_order.id;

    v_source_totals := v_source_totals || jsonb_build_object(
      v_order.id::text,
      jsonb_build_object(
        'subtotal', v_new_subtotal,
        'serviceChargeAmount', v_new_service,
        'taxAmount', v_new_tax,
        'discountAmount', v_new_discount,
        'totalAmount', v_new_total
      )
    );
  end loop;

  select round(coalesce(sum(coalesce(price, 0) * coalesce(quantity, 1)), 0)::numeric, 2)
  into v_new_subtotal
  from public.order_items
  where organization_id = p_organization_id
    and order_id = v_target_order.id;

  v_new_service := round(v_new_subtotal * v_order_service_rate, 2);
  v_new_tax := round(v_new_subtotal * v_order_tax_rate, 2);
  v_new_discount := round(v_new_subtotal * v_order_discount_rate, 2);
  v_target_total := greatest(
    0,
    round((v_new_subtotal + v_new_service + v_new_tax - v_new_discount)::numeric, 2)
  );

  update public.orders
  set session_id = v_target_session.id,
      subtotal = v_new_subtotal,
      service_charge_amount = v_new_service,
      vat_amount = v_new_tax,
      discount_amount = v_new_discount,
      total = v_target_total,
      total_amount = v_target_total,
      amount_paid = 0,
      remaining_balance = v_target_total,
      payment_status = 'UNPAID',
      updated_at = v_now
  where organization_id = p_organization_id
    and id = v_target_order.id;

  select count(*)
  into v_source_remaining_item_count
  from public.order_items oi
  join public.orders o
    on o.id = oi.order_id
   and o.organization_id = oi.organization_id
  where oi.organization_id = p_organization_id
    and o.table_id = p_from_table_id
    and upper(coalesce(o.status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED');

  v_source_guest_before := greatest(
    coalesce(v_source_table.current_guests, 0),
    coalesce(v_source_session.guest_count, 0),
    coalesce(v_source_session.guests, 0),
    1
  );
  v_source_guest_after := greatest(v_source_guest_before - 1, 0);

  if v_source_session.id is not null then
    update public.table_sessions
    set guest_count = v_source_guest_after,
        guests = v_source_guest_after,
        status = case
          when v_source_guest_after = 0 and v_source_remaining_item_count = 0
            then 'COMPLETED'
          else status
        end,
        closed_at = case
          when v_source_guest_after = 0 and v_source_remaining_item_count = 0
            then coalesce(closed_at, v_now)
          else closed_at
        end,
        updated_at = v_now
    where organization_id = p_organization_id
      and id = v_source_session.id;
  end if;

  update public.restaurant_tables
  set current_guests = v_source_guest_after,
      status = case
        when v_source_guest_after = 0 and v_source_remaining_item_count = 0
          then 'AVAILABLE'
        else status
      end,
      active_session_id = case
        when v_source_guest_after = 0 and v_source_remaining_item_count = 0
          then null
        else active_session_id
      end,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_from_table_id;

  update public.restaurant_tables
  set current_guests = greatest(
        coalesce(current_guests, 0),
        coalesce(v_target_session.guest_count, 1),
        1
      ),
      status = 'OCCUPIED',
      active_session_id = v_target_session.id,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_to_table_id;

  select array_agg(distinct session_id)
  into v_affected_session_ids
  from unnest(
    coalesce(v_source_session_ids, '{}'::uuid[]) || array[v_target_session.id]
  ) as session_id
  where session_id is not null;

  if coalesce(array_length(v_affected_session_ids, 1), 0) > 0 then
    update public.table_sessions session_row
    set revenue = (
          select round(coalesce(sum(coalesce(o.total_amount, o.total, 0)), 0)::numeric, 2)
          from public.orders o
          where o.organization_id = p_organization_id
            and o.session_id = session_row.id
            and upper(coalesce(o.status, '')) not in ('CANCELLED', 'VOID')
        ),
        orders = (
          select count(*)
          from public.orders o
          where o.organization_id = p_organization_id
            and o.session_id = session_row.id
            and upper(coalesce(o.status, '')) not in ('CANCELLED', 'VOID')
        ),
        updated_at = v_now
    where session_row.organization_id = p_organization_id
      and session_row.id = any(v_affected_session_ids);
  end if;

  return jsonb_build_object(
    'success', true,
    'fromTableId', p_from_table_id,
    'toTableId', p_to_table_id,
    'seatPosition', p_seat_position,
    'movedItems', v_item_count,
    'itemIds', to_jsonb(v_item_ids),
    'sourceOrderIds', to_jsonb(v_source_order_ids),
    'sourceTotals', v_source_totals,
    'targetOrderId', v_target_order.id,
    'targetSessionId', v_target_session.id,
    'targetOrderCreated', v_target_order_created,
    'targetSessionCreated', v_target_session_created,
    'targetTotal', v_target_total,
    'actorId', p_actor_id
  );
end;
$$;

revoke all on function public.restaurant_move_seat_atomic(
  uuid,
  uuid,
  uuid,
  integer,
  uuid
) from public;

revoke all on function public.restaurant_move_seat_atomic(
  uuid,
  uuid,
  uuid,
  integer,
  uuid
) from anon;

revoke all on function public.restaurant_move_seat_atomic(
  uuid,
  uuid,
  uuid,
  integer,
  uuid
) from authenticated;

grant execute on function public.restaurant_move_seat_atomic(
  uuid,
  uuid,
  uuid,
  integer,
  uuid
) to service_role;

commit;
