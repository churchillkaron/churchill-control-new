begin;

create or replace function public.restaurant_merge_table_group_atomic(
  p_organization_id uuid,
  p_master_table_id uuid,
  p_target_table_ids uuid[],
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_target_table_ids uuid[];
  v_all_table_ids uuid[];
  v_master public.restaurant_tables%rowtype;
  v_master_session_id uuid;
  v_requested_count integer := 0;
  v_unique_count integer := 0;
  v_table_count integer := 0;
  v_active_order_count integer := 0;
  v_active_session_count integer := 0;
  v_total_guests integer := 0;
  v_total_amount numeric(18,2) := 0;
  v_has_activity boolean := false;
begin
  if p_organization_id is null then
    raise exception 'organizationId required';
  end if;

  if p_master_table_id is null then
    raise exception 'masterTableId required';
  end if;

  v_requested_count := coalesce(cardinality(p_target_table_ids), 0);

  if v_requested_count = 0 then
    raise exception 'At least one target table is required';
  end if;

  if array_position(p_target_table_ids, null) is not null then
    raise exception 'Target table ids cannot contain null';
  end if;

  if p_master_table_id = any(p_target_table_ids) then
    raise exception 'Cannot merge a table into itself';
  end if;

  select
    array_agg(distinct target_id order by target_id),
    count(distinct target_id)
  into v_target_table_ids, v_unique_count
  from unnest(p_target_table_ids) as target_ids(target_id);

  if v_unique_count <> v_requested_count then
    raise exception 'Target table ids must be unique';
  end if;

  v_all_table_ids := array_prepend(p_master_table_id, v_target_table_ids);

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':restaurant-table-group-merge:' ||
      array_to_string(
        array(
          select table_id::text
          from unnest(v_all_table_ids) as table_ids(table_id)
          order by table_id
        ),
        ':'
      ),
      0
    )
  );

  perform 1
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = any(v_all_table_ids)
  order by id
  for update;

  select count(*)
  into v_table_count
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = any(v_all_table_ids);

  if v_table_count <> cardinality(v_all_table_ids) then
    raise exception 'One or more tables were not found in this organization';
  end if;

  select *
  into v_master
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_master_table_id;

  if upper(coalesce(v_master.status, '')) = 'MERGED'
     or exists (
       select 1
       from public.restaurant_table_merges
       where organization_id = p_organization_id
         and merged_table_id = p_master_table_id
     ) then
    raise exception 'Master table is merged into another table';
  end if;

  if exists (
    select 1
    from public.restaurant_tables
    where organization_id = p_organization_id
      and id = any(v_target_table_ids)
      and upper(coalesce(status, '')) = 'MERGED'
  ) then
    raise exception 'One or more target tables are already merged';
  end if;

  if exists (
    select 1
    from public.restaurant_table_merges
    where organization_id = p_organization_id
      and (
        master_table_id = any(v_target_table_ids)
        or merged_table_id = any(v_target_table_ids)
      )
  ) then
    raise exception 'One or more target tables already belong to a merged group';
  end if;

  perform 1
  from public.orders
  where organization_id = p_organization_id
    and table_id = any(v_all_table_ids)
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED', 'CLOSED')
  order by id
  for update;

  perform 1
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = any(v_all_table_ids)
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by id
  for update;

  if exists (
    select 1
    from public.orders
    where organization_id = p_organization_id
      and table_id = any(v_all_table_ids)
      and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED', 'CLOSED')
      and (
        coalesce(amount_paid, 0) > 0
        or upper(coalesce(payment_status, 'UNPAID')) in (
          'PARTIAL',
          'PARTIALLY_PAID',
          'PAID',
          'SETTLED'
        )
        or exists (
          select 1
          from public.restaurant_payment_allocations allocations
          where allocations.organization_id = p_organization_id
            and allocations.order_id = orders.id
        )
      )
  ) then
    raise exception 'Cannot merge tables after payment allocation has started';
  end if;

  select
    count(*),
    round(coalesce(sum(coalesce(total_amount, total, 0)), 0)::numeric, 2)
  into v_active_order_count, v_total_amount
  from public.orders
  where organization_id = p_organization_id
    and table_id = any(v_all_table_ids)
    and upper(coalesce(status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED', 'CLOSED');

  select count(*)
  into v_active_session_count
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = any(v_all_table_ids)
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED');

  select coalesce(sum(greatest(coalesce(current_guests, 0), 0)), 0)::integer
  into v_total_guests
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = any(v_all_table_ids);

  select id
  into v_master_session_id
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = any(v_all_table_ids)
    and upper(coalesce(status, '')) not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by
    case
      when id = v_master.active_session_id then 0
      when table_id = p_master_table_id then 1
      else 2
    end,
    created_at desc,
    id
  limit 1;

  insert into public.restaurant_table_merges (
    organization_id,
    master_table_id,
    merged_table_id
  )
  select
    p_organization_id,
    p_master_table_id,
    target_id
  from unnest(v_target_table_ids) as target_ids(target_id);

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
    and id = any(v_target_table_ids);

  return jsonb_build_object(
    'success', true,
    'masterTableId', p_master_table_id,
    'mergedTableIds', to_jsonb(v_target_table_ids),
    'mergedTables', cardinality(v_target_table_ids),
    'activeOrders', v_active_order_count,
    'activeSessions', v_active_session_count,
    'totalGuests', v_total_guests,
    'totalAmount', v_total_amount,
    'activeSessionId', v_master_session_id,
    'actorId', p_actor_id
  );
end;
$$;

revoke all on function public.restaurant_merge_table_group_atomic(uuid, uuid, uuid[], uuid) from public;
revoke all on function public.restaurant_merge_table_group_atomic(uuid, uuid, uuid[], uuid) from anon;
revoke all on function public.restaurant_merge_table_group_atomic(uuid, uuid, uuid[], uuid) from authenticated;
grant execute on function public.restaurant_merge_table_group_atomic(uuid, uuid, uuid[], uuid) to service_role;

commit;
