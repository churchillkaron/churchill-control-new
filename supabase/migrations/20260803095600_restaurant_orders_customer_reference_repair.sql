begin;

-- Forward-only repair for the canonical public.orders contract.
--
-- public.orders does not own customer_id or customer_name.
-- Customer context remains on table_sessions and in function inputs.
-- The already-deployed 20260803082408 migration is intentionally
-- preserved without modification.

create or replace function public.pos_create_order_atomic(
  p_organization_id uuid,
  p_table_id uuid,
  p_table_number text,
  p_items jsonb,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_guest_count integer,
  p_staff_id uuid,
  p_staff_name text,
  p_service_charge_rate numeric,
  p_tax_rate numeric,
  p_prices_include_tax boolean,
  p_tax_code_id uuid,
  p_tax_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.restaurant_tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_order public.orders%rowtype;
  v_item jsonb;
  v_item_id text;
  v_inserted_item_ids jsonb := '[]'::jsonb;
  v_quantity integer;
  v_index integer;
  v_price numeric;
  v_subtotal numeric := 0;
  v_service_rate numeric := greatest(coalesce(p_service_charge_rate, 0), 0);
  v_tax_rate numeric := greatest(coalesce(p_tax_rate, 0), 0);
  v_service_charge numeric := 0;
  v_taxable_amount numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_guest_count integer := greatest(coalesce(p_guest_count, 0), 0);
  v_is_new_order boolean := false;
  v_event_type text;
  v_event_payload jsonb;
  v_event_id text;
  v_existing_payload jsonb;
  v_items_count integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_table_id is null and nullif(btrim(p_table_number), '') is null then
    raise exception 'table_id or table_number required';
  end if;

  if p_idempotency_key is null or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'order items required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_idempotency_key,
      0
    )
  );

  select payload
  into v_existing_payload
  from public.system_events
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'order_id', v_existing_payload->>'order_id',
      'session_id', v_existing_payload->>'session_id',
      'inserted_item_ids', coalesce(v_existing_payload->'item_ids', '[]'::jsonb),
      'event_id', null
    );
  end if;

  select *
  into v_table
  from public.restaurant_tables
  where organization_id = p_organization_id
    and (
      (p_table_id is not null and id = p_table_id)
      or
      (
        p_table_id is null
        and table_number::text = p_table_number
      )
    )
  order by case when p_table_id is not null and id = p_table_id then 0 else 1 end
  limit 1
  for update;

  if not found then
    raise exception 'Restaurant table not found';
  end if;

  if upper(coalesce(v_table.status, '')) = 'MERGED' then
    raise exception 'Cannot create an order on a merged table';
  end if;

  if v_table.active_session_id is not null then
    select *
    into v_session
    from public.table_sessions
    where id = v_table.active_session_id
      and organization_id = p_organization_id
      and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
    for update;
  end if;

  if not found then
    select *
    into v_session
    from public.table_sessions
    where organization_id = p_organization_id
      and table_id = v_table.id
      and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
    order by created_at desc
    limit 1
    for update;
  end if;

  if v_session.id is null then
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
      p_customer_id,
      p_customer_name,
      p_customer_email,
      p_customer_phone,
      v_table.id,
      v_table.table_number,
      v_guest_count,
      v_guest_count,
      'OPEN',
      0,
      0,
      now(),
      now(),
      now()
    )
    returning * into v_session;
  else
    if v_guest_count = 0 then
      v_guest_count := greatest(
        coalesce(v_session.guest_count, v_session.guests, 0),
        0
      );
    end if;

    update public.table_sessions
    set customer_id = coalesce(p_customer_id, customer_id),
        customer_name = coalesce(p_customer_name, customer_name),
        customer_email = coalesce(p_customer_email, customer_email),
        customer_phone = coalesce(p_customer_phone, customer_phone),
        table_id = v_table.id,
        table_number = v_table.table_number,
        guest_count = v_guest_count,
        guests = v_guest_count,
        updated_at = now()
    where id = v_session.id
      and organization_id = p_organization_id
    returning * into v_session;
  end if;

  update public.restaurant_tables
  set status = 'OCCUPIED',
      current_guests = v_guest_count,
      active_session_id = v_session.id,
      updated_at = now()
  where id = v_table.id
    and organization_id = p_organization_id;

  select *
  into v_order
  from public.orders
  where organization_id = p_organization_id
    and table_id = v_table.id
    and status = 'OPEN'
  order by created_at desc
  limit 1
  for update;

  if not found then
    v_is_new_order := true;

    insert into public.orders (
      organization_id,
      session_id,
      table_id,
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
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_session.id,
      v_table.id,
      p_staff_id,
      p_staff_name,
      'OPEN',
      'UNPAID',
      'PENDING',
      0,
      0,
      0,
      0,
      0,
      0,
      now(),
      now()
    )
    returning * into v_order;
  else
    update public.orders
    set session_id = coalesce(session_id, v_session.id),
        staff_id = coalesce(staff_id, p_staff_id),
        staff_name = coalesce(staff_name, p_staff_name),
        updated_at = now()
    where id = v_order.id
      and organization_id = p_organization_id
    returning * into v_order;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_quantity := greatest(
      coalesce(nullif(v_item->>'quantity', '')::integer, 1),
      1
    );
    v_price := coalesce(nullif(v_item->>'price', '')::numeric, 0);

    if v_price < 0 then
      raise exception 'Item price cannot be negative';
    end if;

    if nullif(btrim(v_item->>'item_name'), '') is null then
      raise exception 'Item name required';
    end if;

    for v_index in 1..v_quantity
    loop
      insert into public.order_items (
        organization_id,
        order_id,
        dish_id,
        item_name,
        quantity,
        price,
        station,
        status,
        staff_id,
        notes,
        cooking_level,
        seat_position,
        modifiers,
        created_at,
        updated_at
      ) values (
        p_organization_id,
        v_order.id,
        nullif(v_item->>'dish_id', '')::uuid,
        btrim(v_item->>'item_name'),
        1,
        v_price,
        nullif(v_item->>'station', ''),
        'PENDING',
        p_staff_id,
        nullif(v_item->>'notes', ''),
        nullif(v_item->>'cooking_level', ''),
        nullif(v_item->>'seat_position', '')::integer,
        case
          when jsonb_typeof(v_item->'modifiers') in ('object', 'array')
            then v_item->'modifiers'
          else null
        end,
        now(),
        now()
      )
      returning id::text into v_item_id;

      v_inserted_item_ids :=
        v_inserted_item_ids || jsonb_build_array(v_item_id);
      v_items_count := v_items_count + 1;
    end loop;
  end loop;

  select coalesce(sum(
    coalesce(price, 0) * coalesce(quantity, 1)
  ), 0)
  into v_subtotal
  from public.order_items
  where organization_id = p_organization_id
    and order_id = v_order.id;

  v_service_charge := round(v_subtotal * v_service_rate, 2);
  v_taxable_amount := v_subtotal + v_service_charge;

  if coalesce(p_prices_include_tax, false) and v_tax_rate > 0 then
    v_tax_amount := round(
      v_taxable_amount - (v_taxable_amount / (1 + v_tax_rate)),
      2
    );
    v_total := round(v_taxable_amount, 2);
  else
    v_tax_amount := round(v_taxable_amount * v_tax_rate, 2);
    v_total := round(v_taxable_amount + v_tax_amount, 2);
  end if;

  update public.orders
  set subtotal = v_subtotal,
      service_charge_amount = v_service_charge,
      vat_amount = v_tax_amount,
      total = v_total,
      total_amount = v_total,
      updated_at = now()
  where id = v_order.id
    and organization_id = p_organization_id
  returning * into v_order;

  update public.table_sessions
  set revenue = v_total,
      orders = (
        select count(*)
        from public.orders
        where organization_id = p_organization_id
          and session_id = v_session.id
          and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID')
      ),
      updated_at = now()
  where id = v_session.id
    and organization_id = p_organization_id;

  v_event_type := case
    when v_is_new_order then 'ORDER_CREATED'
    else 'ORDER_ITEM_ADDED'
  end;

  v_event_payload := jsonb_build_object(
    'order_id', v_order.id,
    'organization_id', p_organization_id,
    'table_id', v_table.id,
    'table_number', v_table.table_number,
    'session_id', v_session.id,
    'item_ids', v_inserted_item_ids,
    'items_count', v_items_count,
    'tax_code_id', p_tax_code_id,
    'tax_code', p_tax_code,
    'subtotal', v_subtotal,
    'service_charge_amount', v_service_charge,
    'tax_amount', v_tax_amount,
    'total_amount', v_total
  );

  insert into public.system_events (
    organization_id,
    type,
    payload,
    idempotency_key
  ) values (
    p_organization_id,
    v_event_type,
    v_event_payload,
    p_idempotency_key
  )
  returning id::text into v_event_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'order_id', v_order.id,
    'session_id', v_session.id,
    'table_id', v_table.id,
    'inserted_item_ids', v_inserted_item_ids,
    'event_id', v_event_id,
    'event_type', v_event_type,
    'subtotal', v_subtotal,
    'service_charge_amount', v_service_charge,
    'tax_amount', v_tax_amount,
    'total_amount', v_total
  );
end;
$$;

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

commit;
