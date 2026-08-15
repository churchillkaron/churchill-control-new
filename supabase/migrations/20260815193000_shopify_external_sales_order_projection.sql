begin;

create or replace function public.commercial_upsert_external_sales_order_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_channel text,
  p_application_id text,
  p_source_type text,
  p_source_reference text,
  p_order_number text,
  p_party_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_status text,
  p_payment_status text,
  p_fulfillment_status text,
  p_currency_code text,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_paid_amount numeric,
  p_remaining_balance numeric,
  p_confirmed_at timestamptz,
  p_cancelled_at timestamptz,
  p_items jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.sales_orders%rowtype;
  v_item jsonb;
  v_line_number integer := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_discount numeric;
  v_line_subtotal numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_item_type text;
  v_item_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;
  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;
  if nullif(btrim(coalesce(p_source_reference, '')), '') is null then
    raise exception 'source_reference required';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'idempotency_key required';
  end if;
  if nullif(btrim(coalesce(p_currency_code, '')), '') is null then
    raise exception 'currency_code required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'items must be an array';
  end if;

  perform 1
  from public.legal_entities entity
  where entity.id = p_entity_id
    and entity.organization_id = p_organization_id
    and coalesce(entity.is_active, true) = true;
  if not found then
    raise exception 'Active legal entity not found in organization scope';
  end if;

  if p_party_id is not null then
    perform 1
    from public.parties party
    join public.party_relationships relationship
      on relationship.organization_id = party.organization_id
     and relationship.party_id = party.id
     and lower(relationship.relationship_type) = 'customer'
     and lower(coalesce(relationship.status, 'active')) <> 'archived'
    where party.organization_id = p_organization_id
      and party.id = p_party_id
      and lower(coalesce(party.status, 'active')) <> 'archived';
    if not found then
      raise exception 'Customer Party not found in organization scope';
    end if;
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

  if least(
    coalesce(p_subtotal, 0),
    coalesce(p_discount_amount, 0),
    coalesce(p_tax_amount, 0),
    coalesce(p_total_amount, 0),
    coalesce(p_paid_amount, 0),
    coalesce(p_remaining_balance, 0)
  ) < 0 then
    raise exception 'External order amounts must be nonnegative';
  end if;

  select * into v_order
  from public.sales_orders
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key
  for update;

  if v_order.id is null then
    insert into public.sales_orders (
      organization_id,
      entity_id,
      order_number,
      channel,
      application_id,
      source_type,
      source_reference,
      customer_id,
      party_id,
      customer_name,
      customer_email,
      customer_phone,
      status,
      payment_status,
      fulfillment_status,
      currency_code,
      prices_include_tax,
      tax_rate,
      subtotal,
      discount_amount,
      tax_amount,
      total_amount,
      paid_amount,
      remaining_balance,
      created_by_staff_id,
      created_by_name,
      idempotency_key,
      confirmed_at,
      cancelled_at,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      p_entity_id,
      nullif(btrim(coalesce(p_order_number, '')), ''),
      upper(coalesce(nullif(btrim(p_channel), ''), 'EXTERNAL')),
      coalesce(nullif(btrim(p_application_id), ''), 'commercial'),
      coalesce(nullif(btrim(p_source_type), ''), 'external_order'),
      p_source_reference,
      p_party_id,
      p_party_id,
      nullif(btrim(coalesce(p_customer_name, '')), ''),
      nullif(btrim(coalesce(p_customer_email, '')), ''),
      nullif(btrim(coalesce(p_customer_phone, '')), ''),
      upper(p_status),
      upper(p_payment_status),
      upper(p_fulfillment_status),
      upper(p_currency_code),
      false,
      0,
      coalesce(p_subtotal, 0),
      coalesce(p_discount_amount, 0),
      coalesce(p_tax_amount, 0),
      coalesce(p_total_amount, 0),
      coalesce(p_paid_amount, 0),
      coalesce(p_remaining_balance, 0),
      null,
      'Shopify',
      p_idempotency_key,
      p_confirmed_at,
      p_cancelled_at,
      now(),
      now()
    ) returning * into v_order;
  else
    if v_order.entity_id <> p_entity_id then
      raise exception 'External order entity mapping changed';
    end if;

    update public.sales_orders
    set order_number = coalesce(nullif(btrim(coalesce(p_order_number, '')), ''), order_number),
        channel = upper(coalesce(nullif(btrim(p_channel), ''), channel)),
        application_id = coalesce(nullif(btrim(p_application_id), ''), application_id),
        source_type = coalesce(nullif(btrim(p_source_type), ''), source_type),
        source_reference = p_source_reference,
        customer_id = p_party_id,
        party_id = p_party_id,
        customer_name = nullif(btrim(coalesce(p_customer_name, '')), ''),
        customer_email = nullif(btrim(coalesce(p_customer_email, '')), ''),
        customer_phone = nullif(btrim(coalesce(p_customer_phone, '')), ''),
        status = upper(p_status),
        payment_status = upper(p_payment_status),
        fulfillment_status = upper(p_fulfillment_status),
        currency_code = upper(p_currency_code),
        subtotal = coalesce(p_subtotal, 0),
        discount_amount = coalesce(p_discount_amount, 0),
        tax_amount = coalesce(p_tax_amount, 0),
        total_amount = coalesce(p_total_amount, 0),
        paid_amount = coalesce(p_paid_amount, 0),
        remaining_balance = coalesce(p_remaining_balance, 0),
        confirmed_at = coalesce(p_confirmed_at, confirmed_at),
        cancelled_at = p_cancelled_at,
        updated_at = now()
    where id = v_order.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
    returning * into v_order;
  end if;

  delete from public.sales_order_lines
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and sales_order_id = v_order.id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_line_number := v_line_number + 1;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_discount := coalesce((v_item->>'discount_amount')::numeric, 0);
    v_line_subtotal := coalesce((v_item->>'line_subtotal')::numeric, greatest(v_quantity * v_unit_price - v_discount, 0));
    v_line_tax := coalesce((v_item->>'tax_amount')::numeric, 0);
    v_line_total := coalesce((v_item->>'line_total')::numeric, v_line_subtotal + v_line_tax);
    v_item_id := nullif(v_item->>'item_id', '')::uuid;
    v_item_type := case when v_item_id is null then 'service' else 'inventory_item' end;

    if v_quantity <= 0 then
      raise exception 'External order line quantity must be positive';
    end if;
    if least(v_unit_price, v_discount, v_line_subtotal, v_line_tax, v_line_total) < 0 then
      raise exception 'External order line amounts must be nonnegative';
    end if;
    if nullif(btrim(coalesce(v_item->>'item_name', '')), '') is null then
      raise exception 'External order line item_name required';
    end if;

    if v_item_id is not null then
      perform 1
      from public.inventory_items item
      where item.id = v_item_id
        and item.organization_id = p_organization_id
        and (item.entity_id is null or item.entity_id = p_entity_id)
        and coalesce(item.is_active, true) = true;
      if not found then
        raise exception 'Mapped inventory item not found in order scope';
      end if;
    end if;

    insert into public.sales_order_lines (
      organization_id,
      entity_id,
      sales_order_id,
      line_number,
      item_id,
      item_type,
      sku,
      barcode,
      item_name,
      description,
      unit,
      quantity,
      unit_price,
      discount_amount,
      tax_code_id,
      tax_code,
      tax_rate,
      line_subtotal,
      tax_amount,
      line_total,
      source_payload,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      p_entity_id,
      v_order.id,
      v_line_number,
      v_item_id,
      v_item_type,
      nullif(btrim(coalesce(v_item->>'sku', '')), ''),
      nullif(btrim(coalesce(v_item->>'barcode', '')), ''),
      btrim(v_item->>'item_name'),
      nullif(btrim(coalesce(v_item->>'description', '')), ''),
      nullif(btrim(coalesce(v_item->>'unit', '')), ''),
      v_quantity,
      v_unit_price,
      v_discount,
      null,
      null,
      0,
      v_line_subtotal,
      v_line_tax,
      v_line_total,
      coalesce(v_item->'source_payload', '{}'::jsonb),
      now(),
      now()
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'sales_order_id', v_order.id,
    'organization_id', p_organization_id,
    'entity_id', p_entity_id,
    'source_reference', p_source_reference,
    'line_count', v_line_number,
    'status', v_order.status
  );
end;
$$;

revoke all on function public.commercial_upsert_external_sales_order_atomic(
  uuid,uuid,text,text,text,text,text,uuid,text,text,text,text,text,text,text,
  numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,timestamptz,jsonb,text
) from public, anon, authenticated;

grant execute on function public.commercial_upsert_external_sales_order_atomic(
  uuid,uuid,text,text,text,text,text,uuid,text,text,text,text,text,text,text,
  numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,timestamptz,jsonb,text
) to service_role;

commit;
