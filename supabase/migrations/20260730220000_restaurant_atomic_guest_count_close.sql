begin;

create or replace function public.restaurant_set_guest_count_atomic(
  p_organization_id uuid,
  p_table_id uuid,
  p_guest_count integer,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_table public.restaurant_tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_active_order_count integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organizationId required';
  end if;

  if p_table_id is null then
    raise exception 'tableId required';
  end if;

  if p_guest_count is null or p_guest_count < 0 then
    raise exception 'guestCount must be a non-negative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':restaurant-table-guests:' || p_table_id::text,
      0
    )
  );

  select *
  into v_table
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_table_id
  for update;

  if not found then
    raise exception 'Table not found';
  end if;

  if upper(coalesce(v_table.status, '')) = 'MERGED'
     or exists (
       select 1
       from public.restaurant_table_merges
       where organization_id = p_organization_id
         and (
           master_table_id = p_table_id
           or merged_table_id = p_table_id
         )
     ) then
    raise exception 'Guest count must be managed after separating merged tables';
  end if;

  select count(*)
  into v_active_order_count
  from public.orders
  where organization_id = p_organization_id
    and table_id = p_table_id
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED', 'CLOSED');

  if p_guest_count = 0 and v_active_order_count > 0 then
    raise exception 'Guest count cannot be zero while active orders remain';
  end if;

  select *
  into v_session
  from public.table_sessions
  where organization_id = p_organization_id
    and (
      id = v_table.active_session_id
      or table_id = p_table_id
    )
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by
    case when id = v_table.active_session_id then 0 else 1 end,
    created_at desc
  limit 1
  for update;

  if p_guest_count > 0 and v_session.id is null then
    raise exception 'An active table session is required before assigning guests';
  end if;

  if v_session.id is not null then
    update public.table_sessions
    set guest_count = p_guest_count,
        guests = p_guest_count,
        updated_at = v_now
    where organization_id = p_organization_id
      and id = v_session.id
    returning * into v_session;
  end if;

  update public.restaurant_tables
  set current_guests = p_guest_count,
      status = case
        when p_guest_count > 0 or v_session.id is not null then 'OCCUPIED'
        else 'AVAILABLE'
      end,
      active_session_id = case
        when v_session.id is not null then v_session.id
        else null
      end,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_table_id
  returning * into v_table;

  return jsonb_build_object(
    'success', true,
    'tableId', p_table_id,
    'sessionId', v_session.id,
    'guestCount', p_guest_count,
    'status', v_table.status,
    'actorId', p_actor_id
  );
end;
$$;

create or replace function public.restaurant_close_table_atomic(
  p_organization_id uuid,
  p_table_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_table public.restaurant_tables%rowtype;
  v_session_ids uuid[] := '{}'::uuid[];
  v_blocking_orders integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organizationId required';
  end if;

  if p_table_id is null then
    raise exception 'tableId required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':restaurant-table-close:' || p_table_id::text,
      0
    )
  );

  select *
  into v_table
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_table_id
  for update;

  if not found then
    raise exception 'Table not found';
  end if;

  if upper(coalesce(v_table.status, '')) = 'MERGED'
     or exists (
       select 1
       from public.restaurant_table_merges
       where organization_id = p_organization_id
         and (
           master_table_id = p_table_id
           or merged_table_id = p_table_id
         )
     ) then
    raise exception 'Merged tables must be settled or separated before closure';
  end if;

  perform 1
  from public.orders
  where organization_id = p_organization_id
    and table_id = p_table_id
  order by id
  for update;

  select count(*)
  into v_blocking_orders
  from public.orders
  where organization_id = p_organization_id
    and table_id = p_table_id
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID')
    and (
      upper(coalesce(status, '')) not in ('COMPLETED', 'CLOSED')
      or greatest(
        coalesce(
          remaining_balance,
          coalesce(total_amount, total, 0) - coalesce(amount_paid, 0)
        ),
        0
      ) > 0.01
      or (
        coalesce(total_amount, total, 0) > 0.01
        and upper(coalesce(payment_status, 'UNPAID')) not in ('PAID', 'SETTLED')
      )
    );

  if v_blocking_orders > 0 then
    raise exception 'Table cannot close while active or unpaid orders remain';
  end if;

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_session_ids
  from public.table_sessions
  where organization_id = p_organization_id
    and (
      id = v_table.active_session_id
      or table_id = p_table_id
    )
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED');

  if coalesce(array_length(v_session_ids, 1), 0) > 0 then
    perform 1
    from public.table_sessions
    where organization_id = p_organization_id
      and id = any(v_session_ids)
    order by id
    for update;

    update public.table_sessions
    set status = 'CLOSED',
        guest_count = 0,
        guests = 0,
        closed_at = coalesce(closed_at, v_now),
        updated_at = v_now
    where organization_id = p_organization_id
      and id = any(v_session_ids);
  end if;

  update public.restaurant_tables
  set status = 'AVAILABLE',
      current_guests = 0,
      active_session_id = null,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_table_id;

  return jsonb_build_object(
    'success', true,
    'tableId', p_table_id,
    'sessionIds', to_jsonb(v_session_ids),
    'closedSessions', coalesce(array_length(v_session_ids, 1), 0),
    'status', 'AVAILABLE',
    'actorId', p_actor_id
  );
end;
$$;

revoke all on function public.restaurant_set_guest_count_atomic(uuid, uuid, integer, uuid) from public;
revoke all on function public.restaurant_set_guest_count_atomic(uuid, uuid, integer, uuid) from anon;
revoke all on function public.restaurant_set_guest_count_atomic(uuid, uuid, integer, uuid) from authenticated;
grant execute on function public.restaurant_set_guest_count_atomic(uuid, uuid, integer, uuid) to service_role;

revoke all on function public.restaurant_close_table_atomic(uuid, uuid, uuid) from public;
revoke all on function public.restaurant_close_table_atomic(uuid, uuid, uuid) from anon;
revoke all on function public.restaurant_close_table_atomic(uuid, uuid, uuid) from authenticated;
grant execute on function public.restaurant_close_table_atomic(uuid, uuid, uuid) to service_role;

commit;
