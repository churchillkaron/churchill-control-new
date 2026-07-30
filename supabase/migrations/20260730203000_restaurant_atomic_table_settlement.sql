begin;

alter table public.orders
  add column if not exists amount_paid numeric(18,2) not null default 0,
  add column if not exists remaining_balance numeric(18,2),
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.table_sessions
  add column if not exists closed_at timestamptz;

create table if not exists public.restaurant_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null references public.payments(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  allocation_type text not null default 'ORDER',
  amount numeric(18,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists restaurant_payment_allocations_org_payment_idx
  on public.restaurant_payment_allocations (organization_id, payment_id);

create index if not exists restaurant_payment_allocations_org_order_idx
  on public.restaurant_payment_allocations (organization_id, order_id);

create or replace function public.restaurant_settle_table_atomic(
  p_organization_id uuid,
  p_table_number text,
  p_amount numeric,
  p_payment_method text,
  p_partial boolean default false,
  p_item_ids uuid[] default null,
  p_idempotency_key text default null,
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
  v_effective_table_id uuid;
  v_table_ids uuid[];
  v_order_ids uuid[];
  v_session_ids uuid[];
  v_session_id uuid;
  v_total numeric(18,2) := 0;
  v_paid numeric(18,2) := 0;
  v_remaining numeric(18,2) := 0;
  v_requested numeric(18,2) := round(coalesce(p_amount, 0)::numeric, 2);
  v_settlement_amount numeric(18,2) := 0;
  v_payment_id uuid;
  v_existing_payment public.payments%rowtype;
  v_weight_total numeric := 0;
  v_allocation_remaining numeric(18,2) := 0;
  v_allocation numeric(18,2) := 0;
  v_candidate_count integer := 0;
  v_candidate_index integer := 0;
  v_invalid_item_count integer := 0;
  v_order record;
  v_item record;
  v_result_remaining numeric(18,2) := 0;
begin
  if p_organization_id is null then
    raise exception 'organizationId required';
  end if;

  if nullif(trim(coalesce(p_table_number, '')), '') is null then
    raise exception 'tableNumber required';
  end if;

  if nullif(trim(coalesce(p_payment_method, '')), '') is null then
    raise exception 'paymentMethod required';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'idempotencyKey required';
  end if;

  if v_requested <= 0 then
    raise exception 'payment amount must be greater than zero';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':restaurant-settlement:' || p_table_number,
      0
    )
  );

  select *
  into v_existing_payment
  from public.payments
  where organization_id = p_organization_id
    and payment_reference = p_idempotency_key
  order by created_at desc
  limit 1;

  if found then
    select greatest(
      0,
      coalesce(sum(coalesce(o.total_amount, o.total, 0)), 0) -
      coalesce((
        select sum(p.amount)
        from public.payments p
        where p.organization_id = p_organization_id
          and p.status = 'PAID'
          and (
            p.order_id = any(array_agg(o.id))
            or p.session_id = any(array_agg(o.session_id))
          )
      ), 0)
    )
    into v_result_remaining
    from public.orders o
    where o.organization_id = p_organization_id
      and (o.id = v_existing_payment.order_id or o.session_id = v_existing_payment.session_id);

    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'paymentId', v_existing_payment.id,
      'amount', v_existing_payment.amount,
      'remainingBalance', coalesce(v_result_remaining, 0),
      'status', v_existing_payment.status
    );
  end if;

  select *
  into v_table
  from public.restaurant_tables
  where organization_id = p_organization_id
    and table_number::text = p_table_number
  for update;

  if not found then
    raise exception 'Restaurant table not found';
  end if;

  select coalesce(
    (
      select master_table_id
      from public.restaurant_table_merges
      where organization_id = p_organization_id
        and merged_table_id = v_table.id
      limit 1
    ),
    v_table.id
  )
  into v_effective_table_id;

  select array_agg(id order by id)
  into v_table_ids
  from (
    select v_effective_table_id as id
    union
    select merged_table_id
    from public.restaurant_table_merges
    where organization_id = p_organization_id
      and master_table_id = v_effective_table_id
  ) scoped_tables;

  perform 1
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = any(v_table_ids)
  for update;

  perform 1
  from public.orders
  where organization_id = p_organization_id
    and table_id = any(v_table_ids)
    and status not in ('CANCELLED', 'VOID', 'COMPLETED')
  for update;

  select
    array_agg(id order by created_at, id),
    array_remove(array_agg(distinct session_id), null),
    round(coalesce(sum(coalesce(total_amount, total, 0)), 0)::numeric, 2)
  into v_order_ids, v_session_ids, v_total
  from public.orders
  where organization_id = p_organization_id
    and table_id = any(v_table_ids)
    and status not in ('CANCELLED', 'VOID', 'COMPLETED');

  if coalesce(array_length(v_order_ids, 1), 0) = 0 then
    raise exception 'No payable orders found for table';
  end if;

  select id
  into v_session_id
  from public.table_sessions
  where organization_id = p_organization_id
    and table_id = any(v_table_ids)
    and status not in ('CLOSED', 'COMPLETED', 'CANCELLED')
  order by created_at desc
  limit 1;

  if v_session_id is null and coalesce(array_length(v_session_ids, 1), 0) > 0 then
    v_session_id := v_session_ids[1];
  end if;

  select round(coalesce(sum(amount), 0)::numeric, 2)
  into v_paid
  from public.payments
  where organization_id = p_organization_id
    and status = 'PAID'
    and (
      order_id = any(v_order_ids)
      or (
        coalesce(array_length(v_session_ids, 1), 0) > 0
        and session_id = any(v_session_ids)
      )
    );

  v_remaining := greatest(0, round((v_total - v_paid)::numeric, 2));

  if v_remaining <= 0 then
    raise exception 'Table is already fully paid';
  end if;

  if p_partial then
    if v_requested > v_remaining then
      raise exception 'Payment exceeds remaining balance';
    end if;
    v_settlement_amount := v_requested;
  else
    if abs(v_requested - v_remaining) > 0.01 then
      raise exception 'Full payment must equal remaining balance';
    end if;
    v_settlement_amount := v_remaining;
  end if;

  if coalesce(array_length(p_item_ids, 1), 0) > 0 then
    select count(*)
    into v_invalid_item_count
    from unnest(p_item_ids) requested_item_id
    where not exists (
      select 1
      from public.order_items oi
      where oi.organization_id = p_organization_id
        and oi.id = requested_item_id
        and oi.order_id = any(v_order_ids)
    );

    if v_invalid_item_count > 0 then
      raise exception 'Selected payment items do not belong to the table';
    end if;
  end if;

  v_payment_id := gen_random_uuid();

  insert into public.payments (
    id,
    organization_id,
    order_id,
    session_id,
    amount,
    payment_method,
    payment_reference,
    status,
    paid_at,
    created_at,
    updated_at
  ) values (
    v_payment_id,
    p_organization_id,
    null,
    v_session_id,
    v_settlement_amount,
    upper(trim(p_payment_method)),
    p_idempotency_key,
    'PAID',
    v_now,
    v_now,
    v_now
  );

  if coalesce(array_length(p_item_ids, 1), 0) > 0 then
    select coalesce(sum(oi.price * coalesce(oi.quantity, 1)), 0), count(*)
    into v_weight_total, v_candidate_count
    from public.order_items oi
    where oi.organization_id = p_organization_id
      and oi.order_id = any(v_order_ids)
      and oi.id = any(p_item_ids);
  else
    select coalesce(sum(greatest(0, coalesce(o.total_amount, o.total, 0) - coalesce(o.amount_paid, 0))), 0), count(*)
    into v_weight_total, v_candidate_count
    from public.orders o
    where o.organization_id = p_organization_id
      and o.id = any(v_order_ids);
  end if;

  if v_candidate_count <= 0 or v_weight_total <= 0 then
    raise exception 'Unable to allocate payment';
  end if;

  v_allocation_remaining := v_settlement_amount;

  for v_order in
    select
      o.id,
      coalesce(o.total_amount, o.total, 0)::numeric as order_total,
      case
        when coalesce(array_length(p_item_ids, 1), 0) > 0 then (
          select coalesce(sum(oi.price * coalesce(oi.quantity, 1)), 0)
          from public.order_items oi
          where oi.organization_id = p_organization_id
            and oi.order_id = o.id
            and oi.id = any(p_item_ids)
        )
        else greatest(0, coalesce(o.total_amount, o.total, 0) - coalesce(o.amount_paid, 0))
      end::numeric as allocation_weight
    from public.orders o
    where o.organization_id = p_organization_id
      and o.id = any(v_order_ids)
    order by o.created_at, o.id
  loop
    if v_order.allocation_weight <= 0 then
      continue;
    end if;

    v_candidate_index := v_candidate_index + 1;

    if v_candidate_index = v_candidate_count then
      v_allocation := v_allocation_remaining;
    else
      v_allocation := least(
        v_allocation_remaining,
        round((v_settlement_amount * v_order.allocation_weight / v_weight_total)::numeric, 2)
      );
    end if;

    insert into public.restaurant_payment_allocations (
      organization_id,
      payment_id,
      order_id,
      order_item_id,
      allocation_type,
      amount
    ) values (
      p_organization_id,
      v_payment_id,
      v_order.id,
      null,
      'ORDER',
      v_allocation
    );

    update public.orders
    set
      amount_paid = least(
        coalesce(total_amount, total, 0),
        round((coalesce(amount_paid, 0) + v_allocation)::numeric, 2)
      ),
      remaining_balance = greatest(
        0,
        round((coalesce(total_amount, total, 0) - (coalesce(amount_paid, 0) + v_allocation))::numeric, 2)
      ),
      payment_status = case
        when coalesce(total_amount, total, 0) <= coalesce(amount_paid, 0) + v_allocation + 0.01 then 'PAID'
        else 'PARTIAL'
      end,
      payment_method = upper(trim(p_payment_method)),
      paid_at = case
        when coalesce(total_amount, total, 0) <= coalesce(amount_paid, 0) + v_allocation + 0.01 then v_now
        else paid_at
      end,
      status = case
        when coalesce(total_amount, total, 0) <= coalesce(amount_paid, 0) + v_allocation + 0.01 then 'COMPLETED'
        else status
      end,
      completed_at = case
        when coalesce(total_amount, total, 0) <= coalesce(amount_paid, 0) + v_allocation + 0.01 then v_now
        else completed_at
      end,
      updated_at = v_now
    where organization_id = p_organization_id
      and id = v_order.id;

    v_allocation_remaining := round((v_allocation_remaining - v_allocation)::numeric, 2);
  end loop;

  if coalesce(array_length(p_item_ids, 1), 0) > 0 then
    for v_item in
      select
        oi.id,
        oi.order_id,
        (oi.price * coalesce(oi.quantity, 1))::numeric as item_weight
      from public.order_items oi
      where oi.organization_id = p_organization_id
        and oi.order_id = any(v_order_ids)
        and oi.id = any(p_item_ids)
      order by oi.created_at, oi.id
    loop
      insert into public.restaurant_payment_allocations (
        organization_id,
        payment_id,
        order_id,
        order_item_id,
        allocation_type,
        amount
      ) values (
        p_organization_id,
        v_payment_id,
        v_item.order_id,
        v_item.id,
        'ITEM',
        round((v_settlement_amount * v_item.item_weight / v_weight_total)::numeric, 2)
      );
    end loop;
  end if;

  v_result_remaining := greatest(
    0,
    round((v_remaining - v_settlement_amount)::numeric, 2)
  );

  if v_result_remaining <= 0 then
    update public.orders
    set
      amount_paid = coalesce(total_amount, total, 0),
      remaining_balance = 0,
      payment_status = 'PAID',
      payment_method = upper(trim(p_payment_method)),
      paid_at = coalesce(paid_at, v_now),
      status = 'COMPLETED',
      completed_at = coalesce(completed_at, v_now),
      updated_at = v_now
    where organization_id = p_organization_id
      and id = any(v_order_ids);

    update public.table_sessions
    set
      status = 'COMPLETED',
      closed_at = coalesce(closed_at, v_now),
      updated_at = v_now
    where organization_id = p_organization_id
      and table_id = any(v_table_ids)
      and status not in ('CLOSED', 'COMPLETED', 'CANCELLED');

    update public.restaurant_tables
    set
      status = 'AVAILABLE',
      current_guests = 0,
      active_session_id = null,
      updated_at = v_now
    where organization_id = p_organization_id
      and id = any(v_table_ids);

    delete from public.restaurant_table_merges
    where organization_id = p_organization_id
      and (
        master_table_id = v_effective_table_id
        or merged_table_id = any(v_table_ids)
      );
  end if;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'paymentId', v_payment_id,
    'amount', v_settlement_amount,
    'remainingBalance', v_result_remaining,
    'fullyPaid', v_result_remaining <= 0,
    'effectiveTableId', v_effective_table_id,
    'tableIds', to_jsonb(v_table_ids),
    'orderIds', to_jsonb(v_order_ids),
    'actorId', p_actor_id
  );
end;
$$;

revoke all on function public.restaurant_settle_table_atomic(
  uuid,
  text,
  numeric,
  text,
  boolean,
  uuid[],
  text,
  uuid
) from public;

grant execute on function public.restaurant_settle_table_atomic(
  uuid,
  text,
  numeric,
  text,
  boolean,
  uuid[],
  text,
  uuid
) to service_role;

commit;
