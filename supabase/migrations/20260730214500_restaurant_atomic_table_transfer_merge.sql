begin;

create or replace function public.restaurant_transfer_table_atomic(
  p_organization_id uuid,
  p_from_table_id uuid,
  p_to_table_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_source public.restaurant_tables%rowtype;
  v_destination public.restaurant_tables%rowtype;
  v_active_session_id uuid;
  v_order_count integer := 0;
  v_session_count integer := 0;
  v_source_guests integer := 0;
  v_has_activity boolean := false;
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
    raise exception 'Cannot transfer a table into itself';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':restaurant-table-transfer:' ||
      least(p_from_table_id::text, p_to_table_id::text) || ':' ||
      greatest(p_from_table_id::text, p_to_table_id::text),
      0
    )
  );

  perform 1
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = any(array[p_from_table_id, p_to_table_id])
  order by id
  for update;

  select *
  into v_source
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_from_table_id;

  if not found then
    raise exception 'Source table not found';
  end if;

  select *
  into v_destination
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_to_table_id;

  if not found then
    raise exception 'Destination table not found';
  end if;

  if upper(coalesce(v_source.status, '')) = 'MERGED'
     or upper(coalesce(v_destination.status, '')) = 'MERGED'
     or exists (
       select 1
       from public.restaurant_table_merges
       where organization_id = p_organization_id
         and (
           master_table_id = any(array[p_from_table_id, p_to_table_id])
           or merged_table_id = any(array[p_from_table_id, p_to_table_id])
         )
     ) then
    raise exception 'Merged tables must be separated before transfer';
  end if;

  if coalesce(v_destination.current_guests, 0) > 0
     or v_destination.active_session_id is not null
     or exists (
       select 1
       from public.orders
       where organization_id = p_organization_id
         and table_id = p_to_table_id
         and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED')
     )
     or exists (
       select 1
       from public.table_sessions
       where organization_id = p_organization_id
         and table_id = p_to_table_id
         and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
     ) then
    raise exception 'Destination table must be empty; use merge tables instead';
  end if;

  perform 1
  from public.orders
  where organization_id = p_organization_id
    and table_id = p_from_table_id
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED')
  order by id
  for update;

  perform 1
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = p_from_table_id
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by id
  for update;

  update public.orders
  set table_id = p_to_table_id,
      table_number = v_destination.table_number,
      updated_at = v_now
  where organization_id = p_organization_id
    and table_id = p_from_table_id
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED');

  get diagnostics v_order_count = row_count;

  update public.table_sessions
  set table_id = p_to_table_id,
      table_number = v_destination.table_number,
      updated_at = v_now
  where organization_id = p_organization_id
    and table_id = p_from_table_id
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED');

  get diagnostics v_session_count = row_count;

  select id
  into v_active_session_id
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = p_to_table_id
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by
    case when id = v_source.active_session_id then 0 else 1 end,
    created_at desc
  limit 1;

  v_source_guests := greatest(coalesce(v_source.current_guests, 0), 0);
  v_has_activity :=
    v_source_guests > 0
    or v_order_count > 0
    or v_session_count > 0
    or v_active_session_id is not null;

  update public.restaurant_tables
  set status = case when v_has_activity then 'OCCUPIED' else 'AVAILABLE' end,
      current_guests = v_source_guests,
      active_session_id = v_active_session_id,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_to_table_id;

  update public.restaurant_tables
  set status = 'AVAILABLE',
      current_guests = 0,
      active_session_id = null,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_from_table_id;

  return jsonb_build_object(
    'success', true,
    'fromTableId', p_from_table_id,
    'toTableId', p_to_table_id,
    'ordersMoved', v_order_count,
    'sessionsMoved', v_session_count,
    'guestsMoved', v_source_guests,
    'activeSessionId', v_active_session_id,
    'actorId', p_actor_id
  );
end;
$$;

create or replace function public.restaurant_merge_tables_atomic(
  p_organization_id uuid,
  p_master_table_id uuid,
  p_merged_table_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_master public.restaurant_tables%rowtype;
  v_merged public.restaurant_tables%rowtype;
  v_master_session_id uuid;
  v_total_guests integer := 0;
  v_active_order_count integer := 0;
  v_active_session_count integer := 0;
  v_total_amount numeric(18,2) := 0;
  v_has_activity boolean := false;
begin
  if p_organization_id is null then
    raise exception 'organizationId required';
  end if;

  if p_master_table_id is null then
    raise exception 'masterTableId required';
  end if;

  if p_merged_table_id is null then
    raise exception 'targetTableId required';
  end if;

  if p_master_table_id = p_merged_table_id then
    raise exception 'Cannot merge a table into itself';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':restaurant-table-merge:' ||
      least(p_master_table_id::text, p_merged_table_id::text) || ':' ||
      greatest(p_master_table_id::text, p_merged_table_id::text),
      0
    )
  );

  perform 1
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = any(array[p_master_table_id, p_merged_table_id])
  order by id
  for update;

  select *
  into v_master
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_master_table_id;

  if not found then
    raise exception 'Master table not found';
  end if;

  select *
  into v_merged
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_merged_table_id;

  if not found then
    raise exception 'Target table not found';
  end if;

  if upper(coalesce(v_master.status, '')) = 'MERGED'
     or upper(coalesce(v_merged.status, '')) = 'MERGED'
     or exists (
       select 1
       from public.restaurant_table_merges
       where organization_id = p_organization_id
         and (
           master_table_id = any(array[p_master_table_id, p_merged_table_id])
           or merged_table_id = any(array[p_master_table_id, p_merged_table_id])
         )
     ) then
    raise exception 'One or both tables already belong to a merged group';
  end if;

  perform 1
  from public.orders
  where organization_id = p_organization_id
    and table_id = any(array[p_master_table_id, p_merged_table_id])
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED')
  order by id
  for update;

  perform 1
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = any(array[p_master_table_id, p_merged_table_id])
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by id
  for update;

  if exists (
    select 1
    from public.orders
    where organization_id = p_organization_id
      and table_id = any(array[p_master_table_id, p_merged_table_id])
      and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED')
      and (
        coalesce(amount_paid, 0) > 0
        or upper(coalesce(payment_status, 'UNPAID')) in ('PARTIAL', 'PARTIALLY_PAID', 'PAID')
      )
  ) then
    raise exception 'Cannot merge tables after payment has started';
  end if;

  select
    count(*),
    round(coalesce(sum(coalesce(total_amount, total, 0)), 0)::numeric, 2)
  into v_active_order_count, v_total_amount
  from public.orders
  where organization_id = p_organization_id
    and table_id = any(array[p_master_table_id, p_merged_table_id])
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED');

  select count(*)
  into v_active_session_count
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = any(array[p_master_table_id, p_merged_table_id])
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED');

  v_total_guests :=
    greatest(coalesce(v_master.current_guests, 0), 0) +
    greatest(coalesce(v_merged.current_guests, 0), 0);

  select id
  into v_master_session_id
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = any(array[p_master_table_id, p_merged_table_id])
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by
    case
      when id = v_master.active_session_id then 0
      when id = v_merged.active_session_id then 1
      else 2
    end,
    created_at desc
  limit 1;

  insert into public.restaurant_table_merges (
    organization_id,
    master_table_id,
    merged_table_id
  ) values (
    p_organization_id,
    p_master_table_id,
    p_merged_table_id
  );

  v_has_activity :=
    v_total_guests > 0
    or v_active_order_count > 0
    or v_active_session_count > 0;

  update public.restaurant_tables
  set status = case when v_has_activity then 'OCCUPIED' else 'AVAILABLE' end,
      current_guests = v_total_guests,
      active_session_id = v_master_session_id,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_master_table_id;

  update public.restaurant_tables
  set status = 'MERGED',
      current_guests = 0,
      active_session_id = null,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_merged_table_id;

  return jsonb_build_object(
    'success', true,
    'masterTableId', p_master_table_id,
    'mergedTableId', p_merged_table_id,
    'activeOrders', v_active_order_count,
    'activeSessions', v_active_session_count,
    'totalGuests', v_total_guests,
    'totalAmount', v_total_amount,
    'activeSessionId', v_master_session_id,
    'actorId', p_actor_id
  );
end;
$$;

revoke all on function public.restaurant_transfer_table_atomic(uuid, uuid, uuid, uuid) from public;
revoke all on function public.restaurant_transfer_table_atomic(uuid, uuid, uuid, uuid) from anon;
revoke all on function public.restaurant_transfer_table_atomic(uuid, uuid, uuid, uuid) from authenticated;
grant execute on function public.restaurant_transfer_table_atomic(uuid, uuid, uuid, uuid) to service_role;

revoke all on function public.restaurant_merge_tables_atomic(uuid, uuid, uuid, uuid) from public;
revoke all on function public.restaurant_merge_tables_atomic(uuid, uuid, uuid, uuid) from anon;
revoke all on function public.restaurant_merge_tables_atomic(uuid, uuid, uuid, uuid) from authenticated;
grant execute on function public.restaurant_merge_tables_atomic(uuid, uuid, uuid, uuid) to service_role;

commit;
