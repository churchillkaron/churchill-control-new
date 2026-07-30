begin;

create or replace function public.restaurant_assign_bill_group_atomic(
  p_organization_id uuid,
  p_table_id uuid,
  p_item_ids uuid[],
  p_bill_group text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expected integer := 0;
  v_matched integer := 0;
  v_updated integer := 0;
  v_group text := nullif(btrim(p_bill_group), '');
begin
  if p_organization_id is null then
    raise exception 'organizationId required';
  end if;

  if p_table_id is null then
    raise exception 'tableId required';
  end if;

  if p_item_ids is null or coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception 'itemIds required';
  end if;

  if v_group is null then
    raise exception 'billGroup required';
  end if;

  select count(distinct item_id)
  into v_expected
  from unnest(p_item_ids) as requested(item_id)
  where item_id is not null;

  if v_expected = 0 then
    raise exception 'itemIds required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':restaurant-bill-group:' || p_table_id::text,
      0
    )
  );

  perform 1
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_table_id
  for update;

  if not found then
    raise exception 'Table not found';
  end if;

  perform 1
  from public.order_items oi
  join public.orders o
    on o.id = oi.order_id
   and o.organization_id = p_organization_id
  where oi.organization_id = p_organization_id
    and oi.id = any(p_item_ids)
    and o.table_id = p_table_id
  order by oi.id
  for update of oi;

  select count(distinct oi.id)
  into v_matched
  from public.order_items oi
  join public.orders o
    on o.id = oi.order_id
   and o.organization_id = p_organization_id
  where oi.organization_id = p_organization_id
    and oi.id = any(p_item_ids)
    and o.table_id = p_table_id
    and upper(coalesce(o.status, '')) not in ('CANCELLED', 'VOID', 'COMPLETED', 'CLOSED')
    and coalesce(o.amount_paid, 0) <= 0
    and upper(coalesce(o.payment_status, 'UNPAID')) not in ('PARTIAL', 'PARTIALLY_PAID', 'PAID', 'SETTLED');

  if v_matched <> v_expected then
    raise exception 'One or more items are outside this active unpaid table order';
  end if;

  if exists (
    select 1
    from public.restaurant_payment_allocations a
    where a.organization_id = p_organization_id
      and a.order_item_id = any(p_item_ids)
  ) then
    raise exception 'Bill group cannot change after payment allocation';
  end if;

  update public.order_items oi
  set bill_group = v_group,
      updated_at = v_now
  from public.orders o
  where oi.organization_id = p_organization_id
    and oi.id = any(p_item_ids)
    and o.id = oi.order_id
    and o.organization_id = p_organization_id
    and o.table_id = p_table_id;

  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception 'Bill group assignment was not fully applied';
  end if;

  return jsonb_build_object(
    'success', true,
    'tableId', p_table_id,
    'billGroup', v_group,
    'updatedItems', v_updated,
    'actorId', p_actor_id
  );
end;
$$;

revoke all on function public.restaurant_assign_bill_group_atomic(uuid, uuid, uuid[], text, uuid) from public;
revoke all on function public.restaurant_assign_bill_group_atomic(uuid, uuid, uuid[], text, uuid) from anon;
revoke all on function public.restaurant_assign_bill_group_atomic(uuid, uuid, uuid[], text, uuid) from authenticated;
grant execute on function public.restaurant_assign_bill_group_atomic(uuid, uuid, uuid[], text, uuid) to service_role;

commit;
