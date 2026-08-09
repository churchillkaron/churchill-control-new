begin;

alter table public.sales_order_lines
  drop constraint if exists sales_order_lines_item_type_check;

alter table public.sales_order_lines
  add constraint sales_order_lines_item_type_check
  check (lower(item_type) in ('inventory_item', 'service'));

insert into public.finance_number_sequences (
  organization_id,
  entity_id,
  document_type,
  prefix,
  suffix,
  next_number,
  padding,
  reset_policy,
  status,
  created_at,
  updated_at
)
select
  entity.organization_id,
  entity.id,
  sequence.document_type,
  sequence.prefix,
  '',
  1,
  5,
  'MONTHLY',
  'ACTIVE',
  now(),
  now()
from public.legal_entities entity
cross join (
  values
    ('SALES_ORDER'::text, 'SO'::text),
    ('QUOTATION'::text, 'QT'::text)
) as sequence(document_type, prefix)
where entity.organization_id is not null
  and coalesce(entity.is_active, true) = true
  and not exists (
    select 1
    from public.finance_number_sequences existing
    where existing.organization_id = entity.organization_id
      and existing.entity_id = entity.id
      and upper(btrim(existing.document_type)) = sequence.document_type
  );

create table if not exists public.commercial_quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  quotation_number text not null,
  party_id uuid not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  status text not null default 'DRAFT',
  currency_code text not null,
  prices_include_tax boolean not null default false,
  tax_code_id uuid,
  tax_code text,
  tax_rate numeric(18,8) not null default 0,
  subtotal numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  valid_until date not null,
  notes text,
  terms text,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  created_by_staff_id uuid,
  created_by_name text,
  idempotency_key text not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  converted_at timestamptz,
  cancelled_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_quotations_status_check check (
    status in (
      'DRAFT',
      'SENT',
      'ACCEPTED',
      'REJECTED',
      'EXPIRED',
      'CONVERTED',
      'CLOSED',
      'CANCELLED'
    )
  ),
  constraint commercial_quotations_amounts_nonnegative check (
    subtotal >= 0 and
    discount_amount >= 0 and
    tax_amount >= 0 and
    total_amount >= 0 and
    tax_rate >= 0
  ),
  constraint commercial_quotations_scope_id_unique
    unique (organization_id, entity_id, id),
  constraint commercial_quotations_number_unique
    unique (organization_id, entity_id, quotation_number),
  constraint commercial_quotations_idempotency_unique
    unique (organization_id, idempotency_key),
  constraint commercial_quotations_organization_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete restrict
);

create table if not exists public.commercial_quotation_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  quotation_id uuid not null,
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
  constraint commercial_quotation_lines_scope_fkey
    foreign key (organization_id, entity_id, quotation_id)
    references public.commercial_quotations (organization_id, entity_id, id)
    on delete cascade,
  constraint commercial_quotation_lines_order_unique
    unique (quotation_id, line_number),
  constraint commercial_quotation_lines_item_type_check
    check (lower(item_type) in ('inventory_item', 'service')),
  constraint commercial_quotation_lines_quantity_positive
    check (quantity > 0),
  constraint commercial_quotation_lines_amounts_nonnegative check (
    unit_price >= 0 and
    discount_amount >= 0 and
    tax_rate >= 0 and
    line_subtotal >= 0 and
    tax_amount >= 0 and
    line_total >= 0
  )
);

create index if not exists commercial_quotations_scope_created_idx
  on public.commercial_quotations (organization_id, entity_id, created_at desc);

create index if not exists commercial_quotations_scope_status_idx
  on public.commercial_quotations (organization_id, entity_id, status, valid_until);

create index if not exists commercial_quotations_party_idx
  on public.commercial_quotations (organization_id, party_id, created_at desc);

create index if not exists commercial_quotation_lines_scope_idx
  on public.commercial_quotation_lines (
    organization_id,
    entity_id,
    quotation_id,
    line_number
  );

create index if not exists commercial_quotation_lines_inventory_item_idx
  on public.commercial_quotation_lines (organization_id, entity_id, item_id)
  where item_id is not null and lower(item_type) = 'inventory_item';

alter table public.commercial_quotations enable row level security;
alter table public.commercial_quotation_lines enable row level security;

revoke all on table public.commercial_quotations
  from public, anon, authenticated;
revoke all on table public.commercial_quotation_lines
  from public, anon, authenticated;

grant select, insert, update, delete on table public.commercial_quotations
  to service_role;
grant select, insert, update, delete on table public.commercial_quotation_lines
  to service_role;

create or replace function public.commercial_create_quotation_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_currency_code text,
  p_prices_include_tax boolean,
  p_tax_code_id uuid,
  p_tax_code text,
  p_tax_rate numeric,
  p_items jsonb,
  p_valid_until date,
  p_notes text,
  p_terms text,
  p_actor_staff_id uuid,
  p_actor_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.commercial_quotations%rowtype;
  v_quotation public.commercial_quotations%rowtype;
  v_party public.parties%rowtype;
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
  v_quotation_number text;
  v_line_ids jsonb := '[]'::jsonb;
  v_line_id uuid;
  v_event_id text;
  v_item_type text;
  v_item_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;

  if p_party_id is null then
    raise exception 'party_id required';
  end if;

  if nullif(btrim(p_currency_code), '') is null then
    raise exception 'currency_code required';
  end if;

  if p_valid_until is null or p_valid_until < current_date then
    raise exception 'valid_until must be today or later';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  if p_actor_staff_id is null then
    raise exception 'authenticated staff identity required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'quotation lines required';
  end if;

  perform 1
  from public.legal_entities entity
  where entity.id = p_entity_id
    and entity.organization_id = p_organization_id
    and coalesce(entity.is_active, true) = true;

  if not found then
    raise exception 'Entity is outside organization scope or inactive';
  end if;

  select party.*
  into v_party
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

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':quotation-create:' || btrim(p_idempotency_key),
      0
    )
  );

  select quotation.*
  into v_existing
  from public.commercial_quotations quotation
  where quotation.organization_id = p_organization_id
    and quotation.idempotency_key = btrim(p_idempotency_key)
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'quotation_id', v_existing.id,
      'quotation_number', v_existing.quotation_number,
      'status', v_existing.status,
      'total_amount', v_existing.total_amount,
      'currency_code', v_existing.currency_code
    );
  end if;

  v_quotation_number := public.finance_next_document_number(
    p_organization_id,
    p_entity_id,
    'QUOTATION',
    'QT',
    current_date
  );

  insert into public.commercial_quotations (
    organization_id,
    entity_id,
    quotation_number,
    party_id,
    customer_name,
    customer_email,
    customer_phone,
    status,
    currency_code,
    prices_include_tax,
    tax_code_id,
    tax_code,
    tax_rate,
    valid_until,
    notes,
    terms,
    created_by_staff_id,
    created_by_name,
    idempotency_key,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    v_quotation_number,
    p_party_id,
    coalesce(nullif(btrim(p_customer_name), ''), v_party.display_name),
    coalesce(nullif(btrim(p_customer_email), ''), v_party.email),
    coalesce(nullif(btrim(p_customer_phone), ''), v_party.phone),
    'DRAFT',
    upper(btrim(p_currency_code)),
    coalesce(p_prices_include_tax, false),
    p_tax_code_id,
    nullif(btrim(p_tax_code), ''),
    greatest(coalesce(p_tax_rate, 0), 0),
    p_valid_until,
    nullif(btrim(p_notes), ''),
    nullif(btrim(p_terms), ''),
    p_actor_staff_id,
    nullif(btrim(p_actor_name), ''),
    btrim(p_idempotency_key),
    now(),
    now()
  )
  returning * into v_quotation;

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
    v_item_type := lower(
      coalesce(nullif(btrim(v_item->>'item_type'), ''), 'inventory_item')
    );
    v_item_id := nullif(v_item->>'item_id', '')::uuid;

    if v_item_type not in ('inventory_item', 'service') then
      raise exception 'Line % item type is invalid', v_line_number;
    end if;

    if v_item_type = 'inventory_item' and v_item_id is null then
      raise exception 'Line % inventory item required', v_line_number;
    end if;

    if v_item_type = 'service' then
      v_item_id := null;
    end if;

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

    if v_item_type = 'inventory_item' and not exists (
      select 1
      from public.inventory_items catalog_item
      where catalog_item.id = v_item_id
        and catalog_item.organization_id = p_organization_id
        and coalesce(catalog_item.is_active, true) = true
    ) then
      raise exception 'Line % inventory item is outside organization scope or inactive',
        v_line_number;
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

    insert into public.commercial_quotation_lines (
      organization_id,
      entity_id,
      quotation_id,
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
      v_quotation.id,
      v_line_number,
      v_item_id,
      v_item_type,
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

  update public.commercial_quotations quotation
  set subtotal = round(v_subtotal, 2),
      discount_amount = round(v_discount_total, 2),
      tax_amount = round(v_tax_total, 2),
      total_amount = round(v_total, 2),
      updated_at = now()
  where quotation.id = v_quotation.id
    and quotation.organization_id = p_organization_id
    and quotation.entity_id = p_entity_id
  returning quotation.* into v_quotation;

  insert into public.system_events (
    organization_id,
    type,
    payload,
    idempotency_key
  ) values (
    p_organization_id,
    'COMMERCIAL_QUOTATION_CREATED',
    jsonb_build_object(
      'quotation_id', v_quotation.id,
      'quotation_number', v_quotation.quotation_number,
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'party_id', p_party_id,
      'line_ids', v_line_ids,
      'line_count', v_line_number,
      'currency_code', v_quotation.currency_code,
      'subtotal', v_quotation.subtotal,
      'tax_amount', v_quotation.tax_amount,
      'total_amount', v_quotation.total_amount,
      'status', v_quotation.status
    ),
    btrim(p_idempotency_key)
  )
  returning id::text into v_event_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'quotation_id', v_quotation.id,
    'quotation_number', v_quotation.quotation_number,
    'status', v_quotation.status,
    'line_ids', v_line_ids,
    'line_count', v_line_number,
    'event_id', v_event_id,
    'event_type', 'COMMERCIAL_QUOTATION_CREATED',
    'currency_code', v_quotation.currency_code,
    'subtotal', v_quotation.subtotal,
    'discount_amount', v_quotation.discount_amount,
    'tax_amount', v_quotation.tax_amount,
    'total_amount', v_quotation.total_amount
  );
end;
$$;

create or replace function public.commercial_transition_quotation_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_quotation_id uuid,
  p_action text,
  p_actor_id uuid,
  p_actor_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quotation public.commercial_quotations%rowtype;
  v_action text;
  v_next_status text;
  v_event_type text;
  v_event_id text;
  v_existing_event_type text;
  v_existing_event jsonb;
  v_items jsonb;
  v_order_result jsonb;
  v_sales_order_id uuid;
begin
  if p_organization_id is null or p_entity_id is null or p_quotation_id is null then
    raise exception 'organization_id, entity_id and quotation_id required';
  end if;

  if p_actor_id is null then
    raise exception 'authenticated staff identity required';
  end if;

  if nullif(btrim(p_action), '') is null then
    raise exception 'quotation action required';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  v_action := upper(btrim(p_action));

  if v_action not in ('SEND', 'ACCEPT', 'REJECT', 'CANCEL', 'EXPIRE', 'CLOSE', 'CONVERT') then
    raise exception 'Unsupported quotation action %', v_action;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':quotation-action:' || btrim(p_idempotency_key),
      0
    )
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':quotation:' || p_quotation_id::text,
      0
    )
  );

  select event.type, event.payload
  into v_existing_event_type, v_existing_event
  from public.system_events event
  where event.organization_id = p_organization_id
    and event.idempotency_key = btrim(p_idempotency_key)
  order by event.created_at asc
  limit 1;

  if found then
    if v_existing_event->>'quotation_id' is distinct from p_quotation_id::text
       or v_existing_event->>'action' is distinct from v_action then
      raise exception 'idempotency_key is already used by another operation';
    end if;

    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'quotation_id', p_quotation_id,
      'quotation_number', v_existing_event->>'quotation_number',
      'status', v_existing_event->>'status',
      'sales_order_id', nullif(v_existing_event->>'sales_order_id', '')
    );
  end if;

  select quotation.*
  into v_quotation
  from public.commercial_quotations quotation
  where quotation.id = p_quotation_id
    and quotation.organization_id = p_organization_id
    and quotation.entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Quotation not found in organization and entity scope';
  end if;

  if v_action = 'SEND' then
    if v_quotation.status <> 'DRAFT' then
      raise exception 'Only draft quotations can be sent';
    end if;
    if v_quotation.valid_until < current_date then
      raise exception 'Expired quotation cannot be sent';
    end if;
    v_next_status := 'SENT';
    v_event_type := 'COMMERCIAL_QUOTATION_SENT';
  elsif v_action = 'ACCEPT' then
    if v_quotation.status <> 'SENT' then
      raise exception 'Only sent quotations can be accepted';
    end if;
    if v_quotation.valid_until < current_date then
      raise exception 'Expired quotation cannot be accepted';
    end if;
    v_next_status := 'ACCEPTED';
    v_event_type := 'COMMERCIAL_QUOTATION_ACCEPTED';
  elsif v_action = 'REJECT' then
    if v_quotation.status <> 'SENT' then
      raise exception 'Only sent quotations can be rejected';
    end if;
    v_next_status := 'REJECTED';
    v_event_type := 'COMMERCIAL_QUOTATION_REJECTED';
  elsif v_action = 'CANCEL' then
    if v_quotation.status not in ('DRAFT', 'SENT') then
      raise exception 'Only draft or sent quotations can be cancelled';
    end if;
    v_next_status := 'CANCELLED';
    v_event_type := 'COMMERCIAL_QUOTATION_CANCELLED';
  elsif v_action = 'EXPIRE' then
    if v_quotation.status not in ('DRAFT', 'SENT') then
      raise exception 'Only draft or sent quotations can expire';
    end if;
    if v_quotation.valid_until >= current_date then
      raise exception 'Quotation has not expired';
    end if;
    v_next_status := 'EXPIRED';
    v_event_type := 'COMMERCIAL_QUOTATION_EXPIRED';
  elsif v_action = 'CLOSE' then
    if v_quotation.status not in (
      'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'
    ) then
      raise exception 'Quotation cannot be closed from status %', v_quotation.status;
    end if;
    v_next_status := 'CLOSED';
    v_event_type := 'COMMERCIAL_QUOTATION_CLOSED';
  else
    if v_quotation.status = 'CONVERTED' and v_quotation.sales_order_id is not null then
      return jsonb_build_object(
        'success', true,
        'duplicate', true,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'status', v_quotation.status,
        'sales_order_id', v_quotation.sales_order_id
      );
    end if;

    if v_quotation.status <> 'ACCEPTED' then
      raise exception 'Only accepted quotations can be converted';
    end if;

    select jsonb_agg(
      jsonb_build_object(
        'item_id', line.item_id,
        'item_type', line.item_type,
        'sku', line.sku,
        'barcode', line.barcode,
        'item_name', line.item_name,
        'description', line.description,
        'unit', line.unit,
        'quantity', line.quantity,
        'unit_price', line.unit_price,
        'discount_amount', line.discount_amount,
        'tax_code_id', line.tax_code_id,
        'tax_code', line.tax_code,
        'tax_rate', line.tax_rate,
        'source_payload', coalesce(line.source_payload, '{}'::jsonb) ||
          jsonb_build_object(
            'source', 'commercial_quotation',
            'quotation_id', v_quotation.id,
            'quotation_line_id', line.id
          )
      )
      order by line.line_number
    )
    into v_items
    from public.commercial_quotation_lines line
    where line.organization_id = p_organization_id
      and line.entity_id = p_entity_id
      and line.quotation_id = p_quotation_id;

    if v_items is null or jsonb_array_length(v_items) = 0 then
      raise exception 'Quotation has no lines';
    end if;

    v_order_result := public.commercial_create_sales_order_draft_party_atomic(
      p_organization_id,
      p_entity_id,
      'COMMERCIAL',
      'commercial',
      'quotation',
      v_quotation.quotation_number,
      v_quotation.party_id,
      v_quotation.customer_name,
      v_quotation.customer_email,
      v_quotation.customer_phone,
      v_quotation.currency_code,
      v_quotation.prices_include_tax,
      v_quotation.tax_code_id,
      v_quotation.tax_code,
      v_quotation.tax_rate,
      v_items,
      p_actor_id,
      p_actor_name,
      v_quotation.notes,
      btrim(p_idempotency_key) || ':sales-order'
    );

    v_sales_order_id := nullif(v_order_result->>'sales_order_id', '')::uuid;
    if v_sales_order_id is null then
      raise exception 'Quotation conversion did not create a sales order';
    end if;

    v_next_status := 'CONVERTED';
    v_event_type := 'COMMERCIAL_QUOTATION_CONVERTED';
  end if;

  update public.commercial_quotations quotation
  set status = v_next_status,
      sales_order_id = case
        when v_action = 'CONVERT' then v_sales_order_id
        else quotation.sales_order_id
      end,
      sent_at = case when v_action = 'SEND' then now() else quotation.sent_at end,
      accepted_at = case when v_action = 'ACCEPT' then now() else quotation.accepted_at end,
      rejected_at = case when v_action = 'REJECT' then now() else quotation.rejected_at end,
      converted_at = case when v_action = 'CONVERT' then now() else quotation.converted_at end,
      cancelled_at = case when v_action = 'CANCEL' then now() else quotation.cancelled_at end,
      closed_at = case when v_action = 'CLOSE' then now() else quotation.closed_at end,
      updated_at = now()
  where quotation.id = v_quotation.id
    and quotation.organization_id = p_organization_id
    and quotation.entity_id = p_entity_id
  returning quotation.* into v_quotation;

  insert into public.system_events (
    organization_id,
    type,
    payload,
    idempotency_key
  ) values (
    p_organization_id,
    v_event_type,
    jsonb_build_object(
      'quotation_id', v_quotation.id,
      'quotation_number', v_quotation.quotation_number,
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'party_id', v_quotation.party_id,
      'action', v_action,
      'status', v_quotation.status,
      'sales_order_id', v_quotation.sales_order_id,
      'actor_id', p_actor_id
    ),
    btrim(p_idempotency_key)
  )
  returning id::text into v_event_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'quotation_id', v_quotation.id,
    'quotation_number', v_quotation.quotation_number,
    'status', v_quotation.status,
    'sales_order_id', v_quotation.sales_order_id,
    'event_id', v_event_id,
    'event_type', v_event_type
  );
end;
$$;

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
set search_path = ''
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
  v_inventory_line_count integer := 0;
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

  select event.type, event.payload
  into v_existing_event_type, v_existing_event
  from public.system_events event
  where event.organization_id = p_organization_id
    and event.idempotency_key = btrim(p_idempotency_key)
  order by event.created_at asc
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

  select sales_order.*
  into v_order
  from public.sales_orders sales_order
  where sales_order.id = p_sales_order_id
    and sales_order.organization_id = p_organization_id
    and sales_order.entity_id = p_entity_id
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
    from public.sales_order_lines line
    where line.sales_order_id = v_order.id
      and line.organization_id = p_organization_id
      and line.entity_id = p_entity_id
  ) then
    raise exception 'Sales order has no lines';
  end if;

  if exists (
    select 1
    from public.sales_order_lines line
    where line.sales_order_id = v_order.id
      and line.organization_id = p_organization_id
      and line.entity_id = p_entity_id
      and lower(line.item_type) not in ('inventory_item', 'service')
  ) then
    raise exception 'Sales order contains an unsupported line type';
  end if;

  if exists (
    select 1
    from public.sales_order_lines line
    where line.sales_order_id = v_order.id
      and line.organization_id = p_organization_id
      and line.entity_id = p_entity_id
      and lower(line.item_type) = 'inventory_item'
      and line.item_id is null
  ) then
    raise exception 'Every inventory line must reference an inventory item';
  end if;

  select count(*)::integer
  into v_inventory_line_count
  from public.sales_order_lines line
  where line.sales_order_id = v_order.id
    and line.organization_id = p_organization_id
    and line.entity_id = p_entity_id
    and lower(line.item_type) = 'inventory_item';

  for v_line in
    select line.item_id, sum(line.quantity) as quantity
    from public.sales_order_lines line
    where line.sales_order_id = v_order.id
      and line.organization_id = p_organization_id
      and line.entity_id = p_entity_id
      and lower(line.item_type) = 'inventory_item'
      and line.item_id is not null
    group by line.item_id
    order by line.item_id
  loop
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
        when upper(movement.type) in (
          'PURCHASE',
          'GOODS_RECEIPT',
          'PRODUCTION',
          'ADJUSTMENT_IN',
          'TRANSFER_IN'
        ) then movement.quantity
        when upper(movement.type) in (
          'SALE',
          'CONSUMPTION',
          'WASTE',
          'ADJUSTMENT_OUT',
          'TRANSFER_OUT',
          'BATCH_PRODUCTION'
        ) then -movement.quantity
        else movement.quantity
      end
    ), 0)
    into v_available
    from public.inventory_movements movement
    where movement.organization_id = p_organization_id
      and movement.entity_id = p_entity_id
      and movement.item_id = v_line.item_id;

    select coalesce(sum(reservation.quantity), 0)
    into v_reserved
    from public.inventory_reservations reservation
    where reservation.organization_id = p_organization_id
      and reservation.entity_id = p_entity_id
      and reservation.item_id = v_line.item_id
      and reservation.status = 'ACTIVE'
      and not (
        reservation.source_document = 'sales_order'
        and reservation.source_document_id = v_order.id
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
    'SO',
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
    and lower(line.item_type) = 'inventory_item'
    and line.item_id is not null
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

  update public.sales_orders sales_order
  set order_number = v_order_number,
      status = 'CONFIRMED',
      fulfillment_status = case
        when v_inventory_line_count > 0 then 'RESERVED'
        else 'NOT_STARTED'
      end,
      confirmed_at = now(),
      updated_at = now()
  where sales_order.id = v_order.id
    and sales_order.organization_id = p_organization_id
    and sales_order.entity_id = p_entity_id
  returning sales_order.* into v_order;

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
      'inventory_line_count', v_inventory_line_count,
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
    'inventory_line_count', v_inventory_line_count,
    'reservation_count', v_reservation_count,
    'event_id', v_event_id,
    'event_type', 'SALES_ORDER_CONFIRMED'
  );
end;
$$;

revoke execute on function public.commercial_create_quotation_atomic(
  uuid, uuid, uuid, text, text, text, text, boolean, uuid, text, numeric,
  jsonb, date, text, text, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.commercial_create_quotation_atomic(
  uuid, uuid, uuid, text, text, text, text, boolean, uuid, text, numeric,
  jsonb, date, text, text, uuid, text, text
) to service_role;

revoke execute on function public.commercial_transition_quotation_atomic(
  uuid, uuid, uuid, text, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.commercial_transition_quotation_atomic(
  uuid, uuid, uuid, text, uuid, text, text
) to service_role;

revoke execute on function public.commercial_confirm_sales_order_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.commercial_confirm_sales_order_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;

comment on table public.commercial_quotations is
  'Organization- and entity-scoped Commercial quotations owned by a customer Party.';

comment on table public.commercial_quotation_lines is
  'Immutable commercial line snapshots for inventory items and non-stock services.';

comment on function public.commercial_create_quotation_atomic(
  uuid, uuid, uuid, text, text, text, text, boolean, uuid, text, numeric,
  jsonb, date, text, text, uuid, text, text
) is
  'Creates and numbers one customer Party quotation with validated inventory or service lines atomically.';

comment on function public.commercial_transition_quotation_atomic(
  uuid, uuid, uuid, text, uuid, text, text
) is
  'Executes controlled quotation lifecycle transitions and converts accepted quotations to sales-order drafts atomically.';

comment on function public.commercial_confirm_sales_order_atomic(
  uuid, uuid, uuid, uuid, text
) is
  'Confirms a sales order, reserves inventory lines only, supports service and mixed orders, assigns a document number, and emits an idempotent event.';

notify pgrst, 'reload schema';

commit;
