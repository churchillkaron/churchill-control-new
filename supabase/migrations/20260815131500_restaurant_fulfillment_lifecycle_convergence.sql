begin;

alter table public.kitchen_tickets
  add column if not exists entity_id uuid;

alter table public.bar_tickets
  add column if not exists entity_id uuid;

update public.kitchen_tickets ticket
set entity_id = orders.entity_id,
    updated_at = now()
from public.orders orders
where orders.organization_id = ticket.organization_id
  and orders.id = ticket.order_id
  and ticket.entity_id is null
  and orders.entity_id is not null;

update public.bar_tickets ticket
set entity_id = orders.entity_id,
    updated_at = now()
from public.orders orders
where orders.organization_id = ticket.organization_id
  and orders.id = ticket.order_id
  and ticket.entity_id is null
  and orders.entity_id is not null;

do $$
begin
  if exists (select 1 from public.kitchen_tickets where entity_id is null) then
    raise exception 'Kitchen tickets remain without legal entity scope';
  end if;

  if exists (select 1 from public.bar_tickets where entity_id is null) then
    raise exception 'Bar tickets remain without legal entity scope';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kitchen_tickets_entity_id_fkey'
      and conrelid = 'public.kitchen_tickets'::regclass
  ) then
    alter table public.kitchen_tickets
      add constraint kitchen_tickets_entity_id_fkey
      foreign key (entity_id) references public.legal_entities(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bar_tickets_entity_id_fkey'
      and conrelid = 'public.bar_tickets'::regclass
  ) then
    alter table public.bar_tickets
      add constraint bar_tickets_entity_id_fkey
      foreign key (entity_id) references public.legal_entities(id) on delete restrict;
  end if;
end;
$$;

alter table public.kitchen_tickets alter column entity_id set not null;
alter table public.bar_tickets alter column entity_id set not null;

create index if not exists ix_kitchen_tickets_org_entity_status_created
  on public.kitchen_tickets (organization_id, entity_id, status, created_at);

create index if not exists ix_bar_tickets_org_entity_status_created
  on public.bar_tickets (organization_id, entity_id, status, created_at);

create or replace function public.restaurant_transition_fulfillment_item_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_source_type text,
  p_ticket_id uuid,
  p_item_id uuid,
  p_status text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_source_type text := lower(trim(coalesce(p_source_type, '')));
  v_target_status text := upper(trim(coalesce(p_status, '')));
  v_ticket_status text;
  v_order_id uuid;
  v_session_id uuid;
  v_table_id uuid;
  v_table_number text;
  v_work_center_id uuid;
  v_items jsonb;
  v_started_at timestamptz;
  v_ready_at timestamptz;
  v_completed_at timestamptz;
  v_item_index integer;
  v_item jsonb;
  v_order_item_id uuid;
  v_current_status text;
  v_all_completed boolean := false;
  v_all_served boolean := false;
  v_all_ready boolean := false;
  v_any_preparing boolean := false;
  v_ticket_json jsonb;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if p_ticket_id is null then raise exception 'ticketId required'; end if;
  if p_item_id is null then raise exception 'itemId required'; end if;

  if v_target_status in ('START', 'STARTED', 'IN_PROGRESS') then
    v_target_status := 'PREPARING';
  elsif v_target_status in ('HANDOFF', 'HANDED_OFF') then
    v_target_status := 'SERVED';
  elsif v_target_status = 'COMPLETE' then
    v_target_status := 'COMPLETED';
  end if;

  if v_target_status not in ('PREPARING', 'READY', 'SERVED', 'COMPLETED') then
    raise exception 'Unsupported restaurant fulfillment transition: %', v_target_status;
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id
    and is_active = true;

  if not found then
    raise exception 'Selected legal entity is outside the organization or inactive';
  end if;

  if v_source_type in ('restaurant_kitchen_ticket', 'kitchen_ticket', 'kitchen') then
    v_source_type := 'restaurant_kitchen_ticket';

    select status, order_id, session_id, table_id, table_number, work_center_id, items, started_at, ready_at, completed_at
    into v_ticket_status, v_order_id, v_session_id, v_table_id, v_table_number, v_work_center_id, v_items, v_started_at, v_ready_at, v_completed_at
    from public.kitchen_tickets
    where id = p_ticket_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
    for update;
  elsif v_source_type in ('restaurant_bar_ticket', 'bar_ticket', 'bar') then
    v_source_type := 'restaurant_bar_ticket';

    select status, order_id, session_id, table_id, table_number, work_center_id, items, started_at, ready_at, completed_at
    into v_ticket_status, v_order_id, v_session_id, v_table_id, v_table_number, v_work_center_id, v_items, v_started_at, v_ready_at, v_completed_at
    from public.bar_tickets
    where id = p_ticket_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
    for update;
  else
    raise exception 'Unsupported restaurant fulfillment source: %', p_source_type;
  end if;

  if not found then
    raise exception 'Restaurant fulfillment ticket not found in selected organization and entity';
  end if;

  select ordinality::integer - 1, value
  into v_item_index, v_item
  from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) with ordinality
  where value->>'id' = p_item_id::text
     or value->>'order_item_id' = p_item_id::text
  order by ordinality
  limit 1;

  if not found then
    raise exception 'Restaurant fulfillment item not found in ticket';
  end if;

  v_order_item_id := coalesce(
    nullif(v_item->>'order_item_id', '')::uuid,
    nullif(v_item->>'id', '')::uuid,
    p_item_id
  );

  v_current_status := upper(trim(coalesce(v_item->>'status', 'NEW')));
  if v_current_status in ('PENDING', 'NEW') then
    v_current_status := 'NEW';
  elsif v_current_status = 'IN_PROGRESS' then
    v_current_status := 'PREPARING';
  end if;

  if v_current_status = v_target_status then
    update public.order_items
    set status = v_target_status,
        kitchen_started_at = case when v_target_status = 'PREPARING' then coalesce(kitchen_started_at, nullif(v_item->>'started_at', '')::timestamptz, v_now) else kitchen_started_at end,
        ready_at = case when v_target_status in ('READY', 'SERVED', 'COMPLETED') then coalesce(ready_at, nullif(v_item->>'ready_at', '')::timestamptz, v_now) else ready_at end,
        expo_ready = case when v_target_status in ('READY', 'SERVED', 'COMPLETED') then true else expo_ready end,
        served_at = case when v_target_status in ('SERVED', 'COMPLETED') then coalesce(served_at, nullif(v_item->>'served_at', '')::timestamptz, v_now) else served_at end,
        sent_to_floor_at = case when v_target_status in ('SERVED', 'COMPLETED') then coalesce(sent_to_floor_at, nullif(v_item->>'served_at', '')::timestamptz, v_now) else sent_to_floor_at end,
        updated_at = v_now
    where id = v_order_item_id
      and order_id = v_order_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id;

    if not found then raise exception 'Canonical order item not found in selected organization and entity'; end if;

    return jsonb_build_object(
      'success', true, 'duplicate', true, 'source_type', v_source_type, 'ticket_id', p_ticket_id,
      'order_id', v_order_id, 'session_id', v_session_id, 'table_id', v_table_id,
      'table_number', v_table_number, 'work_center_id', v_work_center_id, 'entity_id', p_entity_id,
      'status', v_target_status, 'recorded_at', v_now, 'work_item', v_item
    );
  end if;

  if v_current_status = 'NEW' and v_target_status not in ('PREPARING', 'READY') then
    raise exception 'Invalid fulfillment transition from % to %', v_current_status, v_target_status;
  elsif v_current_status = 'PREPARING' and v_target_status <> 'READY' then
    raise exception 'Invalid fulfillment transition from % to %', v_current_status, v_target_status;
  elsif v_current_status = 'READY' and v_target_status <> 'SERVED' then
    raise exception 'Invalid fulfillment transition from % to %', v_current_status, v_target_status;
  elsif v_current_status = 'SERVED' and v_target_status <> 'COMPLETED' then
    raise exception 'Invalid fulfillment transition from % to %', v_current_status, v_target_status;
  elsif v_current_status in ('COMPLETED', 'CANCELLED', 'VOID') then
    raise exception 'Fulfillment item is already terminal: %', v_current_status;
  end if;

  v_item := v_item || jsonb_build_object('status', v_target_status, 'updated_at', v_now);
  if v_target_status = 'PREPARING' and nullif(v_item->>'started_at', '') is null then v_item := v_item || jsonb_build_object('started_at', v_now); end if;
  if v_target_status = 'READY' then v_item := v_item || jsonb_build_object('ready_at', v_now); end if;
  if v_target_status = 'SERVED' then v_item := v_item || jsonb_build_object('served_at', v_now); end if;
  if v_target_status = 'COMPLETED' then
    v_item := v_item || jsonb_build_object('served_at', coalesce(nullif(v_item->>'served_at', '')::timestamptz, v_now), 'completed_at', v_now);
  end if;

  v_items := jsonb_set(coalesce(v_items, '[]'::jsonb), array[v_item_index::text], v_item, false);

  select
    bool_and(status = 'COMPLETED'),
    bool_and(status in ('SERVED', 'COMPLETED')),
    bool_and(status in ('READY', 'SERVED', 'COMPLETED')),
    bool_or(status in ('PREPARING', 'IN_PROGRESS'))
  into v_all_completed, v_all_served, v_all_ready, v_any_preparing
  from (
    select upper(trim(coalesce(value->>'status', 'NEW'))) as status
    from jsonb_array_elements(v_items)
  ) item_statuses;

  v_ticket_status := case
    when coalesce(v_all_completed, false) then 'COMPLETED'
    when coalesce(v_all_served, false) then 'SERVED'
    when coalesce(v_all_ready, false) then 'READY'
    when coalesce(v_any_preparing, false) then 'IN_PROGRESS'
    else 'NEW'
  end;

  if v_ticket_status = 'IN_PROGRESS' and v_started_at is null then v_started_at := v_now; end if;
  if v_ticket_status = 'READY' and v_ready_at is null then v_ready_at := v_now; end if;
  if v_ticket_status = 'COMPLETED' and v_completed_at is null then v_completed_at := v_now; end if;

  if v_source_type = 'restaurant_kitchen_ticket' then
    update public.kitchen_tickets
    set status = v_ticket_status, items = v_items, started_at = v_started_at, ready_at = v_ready_at,
        completed_at = v_completed_at, updated_at = v_now
    where id = p_ticket_id and organization_id = p_organization_id and entity_id = p_entity_id;
  else
    update public.bar_tickets
    set status = v_ticket_status, items = v_items, started_at = v_started_at, ready_at = v_ready_at,
        completed_at = v_completed_at, updated_at = v_now
    where id = p_ticket_id and organization_id = p_organization_id and entity_id = p_entity_id;
  end if;

  update public.order_items
  set status = v_target_status,
      kitchen_started_at = case when v_target_status = 'PREPARING' then coalesce(kitchen_started_at, v_now) else kitchen_started_at end,
      ready_at = case when v_target_status in ('READY', 'SERVED', 'COMPLETED') then coalesce(ready_at, v_now) else ready_at end,
      expo_ready = case when v_target_status in ('READY', 'SERVED', 'COMPLETED') then true else expo_ready end,
      served_at = case when v_target_status in ('SERVED', 'COMPLETED') then coalesce(served_at, v_now) else served_at end,
      sent_to_floor_at = case when v_target_status in ('SERVED', 'COMPLETED') then coalesce(sent_to_floor_at, v_now) else sent_to_floor_at end,
      updated_at = v_now
  where id = v_order_item_id
    and order_id = v_order_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if not found then raise exception 'Canonical order item not found in selected organization and entity'; end if;

  v_ticket_json := jsonb_build_object(
    'id', p_ticket_id, 'organization_id', p_organization_id, 'entity_id', p_entity_id,
    'order_id', v_order_id, 'session_id', v_session_id, 'table_id', v_table_id,
    'table_number', v_table_number, 'work_center_id', v_work_center_id, 'status', v_ticket_status,
    'items', v_items, 'started_at', v_started_at, 'ready_at', v_ready_at,
    'completed_at', v_completed_at, 'updated_at', v_now
  );

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'source_type', v_source_type, 'ticket_id', p_ticket_id,
    'order_id', v_order_id, 'session_id', v_session_id, 'table_id', v_table_id,
    'table_number', v_table_number, 'work_center_id', v_work_center_id, 'entity_id', p_entity_id,
    'status', v_target_status, 'ticket_status', v_ticket_status, 'recorded_at', v_now,
    'actor_id', p_actor_id, 'work_item', v_item, 'ticket', v_ticket_json
  );
end;
$$;

revoke all on function public.restaurant_transition_fulfillment_item_atomic(uuid,uuid,text,uuid,uuid,text,uuid) from public;
revoke all on function public.restaurant_transition_fulfillment_item_atomic(uuid,uuid,text,uuid,uuid,text,uuid) from anon;
revoke all on function public.restaurant_transition_fulfillment_item_atomic(uuid,uuid,text,uuid,uuid,text,uuid) from authenticated;
grant execute on function public.restaurant_transition_fulfillment_item_atomic(uuid,uuid,text,uuid,uuid,text,uuid) to service_role;

create or replace function public.guard_restaurant_order_fulfillment_before_payment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.table_id is null then return new; end if;
  if coalesce(new.amount_paid, 0) <= coalesce(old.amount_paid, 0) then return new; end if;

  if exists (
    select 1
    from public.order_items item
    where item.organization_id = new.organization_id
      and item.order_id = new.id
      and coalesce(upper(trim(item.status)), '') not in ('SERVED', 'COMPLETED', 'CANCELLED', 'VOID')
  ) then
    raise exception 'Restaurant order must be served before payment';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_restaurant_order_fulfillment_before_payment() from public;
revoke all on function public.guard_restaurant_order_fulfillment_before_payment() from anon;
revoke all on function public.guard_restaurant_order_fulfillment_before_payment() from authenticated;
grant execute on function public.guard_restaurant_order_fulfillment_before_payment() to service_role;

drop trigger if exists trg_restaurant_order_fulfillment_before_payment on public.orders;
create trigger trg_restaurant_order_fulfillment_before_payment
before update of amount_paid, payment_status, status on public.orders
for each row
execute function public.guard_restaurant_order_fulfillment_before_payment();

commit;
