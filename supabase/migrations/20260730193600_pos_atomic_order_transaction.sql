begin;

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
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_session.id,
      v_table.id,
      v_table.table_number,
      p_customer_id,
      p_customer_name,
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
        customer_id = coalesce(p_customer_id, customer_id),
        customer_name = coalesce(p_customer_name, customer_name),
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

revoke all on function public.pos_create_order_atomic(
  uuid,
  uuid,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  boolean,
  uuid,
  text,
  text
) from public;

grant execute on function public.pos_create_order_atomic(
  uuid,
  uuid,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  boolean,
  uuid,
  text,
  text
) to service_role;

commit;
