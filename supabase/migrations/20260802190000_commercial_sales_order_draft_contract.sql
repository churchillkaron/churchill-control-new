begin;

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  order_number text,
  channel text not null,
  application_id text,
  source_type text,
  source_reference text,
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  status text not null default 'DRAFT',
  payment_status text not null default 'UNPAID',
  fulfillment_status text not null default 'NOT_STARTED',
  currency_code text not null,
  prices_include_tax boolean not null default false,
  tax_code_id uuid,
  tax_code text,
  tax_rate numeric(18,8) not null default 0,
  subtotal numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  remaining_balance numeric(18,2) not null default 0,
  notes text,
  created_by_staff_id uuid,
  created_by_name text,
  idempotency_key text not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_orders_status_check check (
    status in ('DRAFT', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'CLOSED')
  ),
  constraint sales_orders_payment_status_check check (
    payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'VOID')
  ),
  constraint sales_orders_fulfillment_status_check check (
    fulfillment_status in ('NOT_STARTED', 'RESERVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED')
  ),
  constraint sales_orders_amounts_nonnegative check (
    subtotal >= 0 and
    discount_amount >= 0 and
    tax_amount >= 0 and
    total_amount >= 0 and
    paid_amount >= 0 and
    remaining_balance >= 0
  ),
  constraint sales_orders_tax_rate_nonnegative check (tax_rate >= 0),
  constraint sales_orders_idempotency_unique unique (organization_id, idempotency_key),
  constraint sales_orders_number_unique unique (organization_id, entity_id, order_number)
);

create table if not exists public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  line_number integer not null,
  item_id uuid,
  item_type text not null default 'inventory_item',
  sku text,
  barcode text,
  item_name text not null,
  description text,
  unit text,
  quantity numeric(18,4) not null,
  unit_price numeric(18,4) not null,
  discount_amount numeric(18,2) not null default 0,
  tax_code_id uuid,
  tax_code text,
  tax_rate numeric(18,8) not null default 0,
  line_subtotal numeric(18,2) not null,
  tax_amount numeric(18,2) not null default 0,
  line_total numeric(18,2) not null,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_order_lines_quantity_positive check (quantity > 0),
  constraint sales_order_lines_amounts_nonnegative check (
    unit_price >= 0 and
    discount_amount >= 0 and
    tax_rate >= 0 and
    line_subtotal >= 0 and
    tax_amount >= 0 and
    line_total >= 0
  ),
  constraint sales_order_lines_order_line_unique unique (sales_order_id, line_number)
);

create index if not exists sales_orders_scope_created_idx
  on public.sales_orders (organization_id, entity_id, created_at desc);

create index if not exists sales_orders_scope_status_idx
  on public.sales_orders (organization_id, entity_id, status, payment_status);

create index if not exists sales_order_lines_scope_order_idx
  on public.sales_order_lines (organization_id, entity_id, sales_order_id, line_number);

create index if not exists sales_order_lines_item_idx
  on public.sales_order_lines (organization_id, entity_id, item_id);

alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;

create or replace function public.commercial_create_sales_order_draft_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_channel text,
  p_application_id text,
  p_source_type text,
  p_source_reference text,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_currency_code text,
  p_prices_include_tax boolean,
  p_tax_code_id uuid,
  p_tax_code text,
  p_tax_rate numeric,
  p_items jsonb,
  p_actor_staff_id uuid,
  p_actor_name text,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.sales_orders%rowtype;
  v_order public.sales_orders%rowtype;
  v_item jsonb;
  v_line_number integer := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_discount numeric;
  v_line_subtotal numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_line_tax_rate numeric;
  v_subtotal numeric := 0;
  v_discount_total numeric := 0;
  v_tax_total numeric := 0;
  v_total numeric := 0;
  v_line_ids jsonb := '[]'::jsonb;
  v_line_id uuid;
  v_event_id text;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;

  if nullif(btrim(p_channel), '') is null then
    raise exception 'channel required';
  end if;

  if nullif(btrim(p_currency_code), '') is null then
    raise exception 'currency_code required';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'sales order lines required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id
    and coalesce(is_active, true) = true;

  if not found then
    raise exception 'Entity is outside organization scope or inactive';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_idempotency_key,
      0
    )
  );

  select *
  into v_existing
  from public.sales_orders
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'sales_order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'payment_status', v_existing.payment_status,
      'subtotal', v_existing.subtotal,
      'tax_amount', v_existing.tax_amount,
      'total_amount', v_existing.total_amount,
      'remaining_balance', v_existing.remaining_balance,
      'currency_code', v_existing.currency_code
    );
  end if;

  insert into public.sales_orders (
    organization_id,
    entity_id,
    order_number,
    channel,
    application_id,
    source_type,
    source_reference,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    status,
    payment_status,
    fulfillment_status,
    currency_code,
    prices_include_tax,
    tax_code_id,
    tax_code,
    tax_rate,
    subtotal,
    discount_amount,
    tax_amount,
    total_amount,
    paid_amount,
    remaining_balance,
    notes,
    created_by_staff_id,
    created_by_name,
    idempotency_key,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    null,
    upper(btrim(p_channel)),
    nullif(btrim(p_application_id), ''),
    nullif(btrim(p_source_type), ''),
    nullif(btrim(p_source_reference), ''),
    p_customer_id,
    nullif(btrim(p_customer_name), ''),
    nullif(btrim(p_customer_email), ''),
    nullif(btrim(p_customer_phone), ''),
    'DRAFT',
    'UNPAID',
    'NOT_STARTED',
    upper(btrim(p_currency_code)),
    coalesce(p_prices_include_tax, false),
    p_tax_code_id,
    nullif(btrim(p_tax_code), ''),
    greatest(coalesce(p_tax_rate, 0), 0),
    0,
    0,
    0,
    0,
    0,
    0,
    nullif(btrim(p_notes), ''),
    p_actor_staff_id,
    nullif(btrim(p_actor_name), ''),
    btrim(p_idempotency_key),
    now(),
    now()
  )
  returning * into v_order;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_line_number := v_line_number + 1;
    v_quantity := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);
    v_discount := greatest(
      coalesce(nullif(v_item->>'discount_amount', '')::numeric, 0),
      0
    );
    v_line_tax_rate := greatest(
      coalesce(
        nullif(v_item->>'tax_rate', '')::numeric,
        coalesce(p_tax_rate, 0)
      ),
      0
    );

    if v_quantity <= 0 then
      raise exception 'Line % quantity must be positive', v_line_number;
    end if;

    if v_unit_price < 0 then
      raise exception 'Line % unit price cannot be negative', v_line_number;
    end if;

    if nullif(btrim(v_item->>'item_name'), '') is null then
      raise exception 'Line % item name required', v_line_number;
    end if;

    if v_discount > round(v_quantity * v_unit_price, 2) then
      raise exception 'Line % discount exceeds line value', v_line_number;
    end if;

    v_line_subtotal := round((v_quantity * v_unit_price) - v_discount, 2);

    if coalesce(p_prices_include_tax, false) and v_line_tax_rate > 0 then
      v_line_tax := round(
        v_line_subtotal - (v_line_subtotal / (1 + v_line_tax_rate)),
        2
      );
      v_line_total := v_line_subtotal;
    else
      v_line_tax := round(v_line_subtotal * v_line_tax_rate, 2);
      v_line_total := round(v_line_subtotal + v_line_tax, 2);
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
      nullif(v_item->>'item_id', '')::uuid,
      coalesce(nullif(btrim(v_item->>'item_type'), ''), 'inventory_item'),
      nullif(btrim(v_item->>'sku'), ''),
      nullif(btrim(v_item->>'barcode'), ''),
      btrim(v_item->>'item_name'),
      nullif(btrim(v_item->>'description'), ''),
      nullif(btrim(v_item->>'unit'), ''),
      v_quantity,
      v_unit_price,
      v_discount,
      coalesce(nullif(v_item->>'tax_code_id', '')::uuid, p_tax_code_id),
      coalesce(nullif(btrim(v_item->>'tax_code'), ''), nullif(btrim(p_tax_code), '')),
      v_line_tax_rate,
      v_line_subtotal,
      v_line_tax,
      v_line_total,
      case
        when jsonb_typeof(v_item->'source_payload') in ('object', 'array')
          then v_item->'source_payload'
        else null
      end,
      now(),
      now()
    )
    returning id into v_line_id;

    v_line_ids := v_line_ids || jsonb_build_array(v_line_id);
    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount_total := v_discount_total + v_discount;
    v_tax_total := v_tax_total + v_line_tax;
    v_total := v_total + v_line_total;
  end loop;

  update public.sales_orders
  set subtotal = round(v_subtotal, 2),
      discount_amount = round(v_discount_total, 2),
      tax_amount = round(v_tax_total, 2),
      total_amount = round(v_total, 2),
      remaining_balance = round(v_total, 2),
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
    'SALES_ORDER_DRAFT_CREATED',
    jsonb_build_object(
      'sales_order_id', v_order.id,
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'channel', v_order.channel,
      'application_id', v_order.application_id,
      'line_ids', v_line_ids,
      'line_count', v_line_number,
      'currency_code', v_order.currency_code,
      'subtotal', v_order.subtotal,
      'tax_amount', v_order.tax_amount,
      'total_amount', v_order.total_amount,
      'status', v_order.status
    ),
    p_idempotency_key
  )
  returning id::text into v_event_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'sales_order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'fulfillment_status', v_order.fulfillment_status,
    'line_ids', v_line_ids,
    'line_count', v_line_number,
    'event_id', v_event_id,
    'event_type', 'SALES_ORDER_DRAFT_CREATED',
    'currency_code', v_order.currency_code,
    'subtotal', v_order.subtotal,
    'discount_amount', v_order.discount_amount,
    'tax_amount', v_order.tax_amount,
    'total_amount', v_order.total_amount,
    'remaining_balance', v_order.remaining_balance
  );
end;
$$;

revoke all on function public.commercial_create_sales_order_draft_atomic(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  uuid,
  text,
  numeric,
  jsonb,
  uuid,
  text,
  text,
  text
) from public;

grant execute on function public.commercial_create_sales_order_draft_atomic(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  uuid,
  text,
  numeric,
  jsonb,
  uuid,
  text,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';

commit;
