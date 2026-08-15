begin;

alter table public.orders
  add column if not exists entity_id uuid references public.legal_entities(id) on delete restrict;

alter table public.table_sessions
  add column if not exists entity_id uuid references public.legal_entities(id) on delete restrict;

alter table public.order_items
  add column if not exists entity_id uuid references public.legal_entities(id) on delete restrict;

create index if not exists orders_organization_entity_idx
  on public.orders (organization_id, entity_id);

create index if not exists table_sessions_organization_entity_idx
  on public.table_sessions (organization_id, entity_id);

create index if not exists order_items_organization_entity_idx
  on public.order_items (organization_id, entity_id);

-- Existing operational rows are safe to backfill only when the organization has
-- exactly one active legal entity. Multi-entity history remains intentionally
-- unresolved rather than being guessed.
with single_active_entity as (
  select le.organization_id, le.id as entity_id
  from public.legal_entities le
  where le.is_active = true
    and 1 = (
      select count(*)
      from public.legal_entities sibling
      where sibling.organization_id = le.organization_id
        and sibling.is_active = true
    )
)
update public.orders o
set entity_id = scope.entity_id
from single_active_entity scope
where o.organization_id = scope.organization_id
  and o.entity_id is null;

with single_active_entity as (
  select le.organization_id, le.id as entity_id
  from public.legal_entities le
  where le.is_active = true
    and 1 = (
      select count(*)
      from public.legal_entities sibling
      where sibling.organization_id = le.organization_id
        and sibling.is_active = true
    )
)
update public.table_sessions s
set entity_id = scope.entity_id
from single_active_entity scope
where s.organization_id = scope.organization_id
  and s.entity_id is null;

update public.order_items oi
set entity_id = o.entity_id
from public.orders o
where oi.organization_id = o.organization_id
  and oi.order_id = o.id
  and oi.entity_id is null
  and o.entity_id is not null;

-- Entity-aware wrapper. The existing 17-argument implementation remains the
-- transaction engine during this compatibility step; this overload binds the
-- resulting order/session/items/event to the selected legal entity in the same
-- database transaction.
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
  p_idempotency_key text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_order_id uuid;
  v_session_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id
    and is_active = true;

  if not found then
    raise exception 'Selected legal entity is outside the organization or inactive';
  end if;

  v_result := public.pos_create_order_atomic(
    p_organization_id,
    p_table_id,
    p_table_number,
    p_items,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_guest_count,
    p_staff_id,
    p_staff_name,
    p_service_charge_rate,
    p_tax_rate,
    p_prices_include_tax,
    p_tax_code_id,
    p_tax_code,
    p_idempotency_key
  );

  v_order_id := nullif(v_result->>'order_id', '')::uuid;
  v_session_id := nullif(v_result->>'session_id', '')::uuid;

  if v_order_id is null or v_session_id is null then
    raise exception 'Atomic POS transaction returned incomplete order identity';
  end if;

  if exists (
    select 1
    from public.orders
    where id = v_order_id
      and organization_id = p_organization_id
      and entity_id is not null
      and entity_id <> p_entity_id
  ) then
    raise exception 'Restaurant order belongs to a different legal entity';
  end if;

  if exists (
    select 1
    from public.table_sessions
    where id = v_session_id
      and organization_id = p_organization_id
      and entity_id is not null
      and entity_id <> p_entity_id
  ) then
    raise exception 'Restaurant table session belongs to a different legal entity';
  end if;

  if exists (
    select 1
    from public.order_items
    where order_id = v_order_id
      and organization_id = p_organization_id
      and entity_id is not null
      and entity_id <> p_entity_id
  ) then
    raise exception 'Restaurant order items belong to a different legal entity';
  end if;

  update public.orders
  set entity_id = p_entity_id,
      updated_at = now()
  where id = v_order_id
    and organization_id = p_organization_id;

  update public.table_sessions
  set entity_id = p_entity_id,
      party_id = coalesce(party_id, p_customer_id),
      updated_at = now()
  where id = v_session_id
    and organization_id = p_organization_id;

  update public.order_items
  set entity_id = p_entity_id,
      updated_at = now()
  where order_id = v_order_id
    and organization_id = p_organization_id
    and entity_id is null;

  update public.system_events
  set payload = coalesce(payload, '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
      'entity_id', p_entity_id,
      'party_id', p_customer_id
    )
  )
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;

  return v_result || jsonb_build_object(
    'entity_id', p_entity_id
  );
end;
$$;

-- The legacy SECURITY DEFINER endpoint must never be exposed directly to browser roles.
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
) from anon;

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
) from authenticated;

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
  text,
  uuid
) from public;

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
  text,
  uuid
) from anon;

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
  text,
  uuid
) from authenticated;

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
  text,
  uuid
) to service_role;

commit;
