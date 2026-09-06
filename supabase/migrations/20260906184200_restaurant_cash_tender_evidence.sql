begin;

create or replace function public.restaurant_settle_table_atomic(
  p_organization_id uuid,
  p_table_number text,
  p_amount numeric,
  p_tendered_amount numeric,
  p_payment_method text,
  p_partial boolean,
  p_item_ids uuid[],
  p_idempotency_key text,
  p_actor_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_cash_session_id uuid,
  p_currency_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_payment_id uuid;
  v_payment public.payments%rowtype;
  v_method text := upper(pg_catalog.btrim(coalesce(p_payment_method, '')));
  v_paid numeric(18,2) := round(coalesce(p_amount, 0), 2);
  v_tendered numeric(18,2);
  v_change numeric(18,2);
  v_duplicate boolean;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '') is null then raise exception 'idempotencyKey required'; end if;
  if v_paid <= 0 then raise exception 'payment amount must be greater than zero'; end if;
  if v_method not in ('CASH', 'CARD', 'QR', 'TRANSFER') then raise exception 'Unsupported restaurant payment method'; end if;

  if v_method = 'CASH' then
    v_tendered := round(coalesce(p_tendered_amount, p_amount), 2);
    if v_tendered < v_paid then raise exception 'Cash received cannot be less than the payment amount'; end if;
    v_change := round(v_tendered - v_paid, 2);
  else
    v_tendered := v_paid;
    v_change := 0;
  end if;

  v_result := public.restaurant_settle_table_atomic(
    p_organization_id => p_organization_id,
    p_table_number => p_table_number,
    p_amount => v_paid,
    p_payment_method => v_method,
    p_partial => p_partial,
    p_item_ids => p_item_ids,
    p_idempotency_key => p_idempotency_key,
    p_actor_id => p_actor_id,
    p_entity_id => p_entity_id,
    p_application_id => p_application_id,
    p_cash_session_id => p_cash_session_id,
    p_currency_code => p_currency_code
  );

  v_payment_id := nullif(v_result->>'paymentId', '')::uuid;
  if v_payment_id is null then raise exception 'Atomic restaurant settlement returned no payment identity'; end if;

  select * into v_payment
  from public.payments
  where id = v_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then raise exception 'Restaurant payment not found in selected organization and entity'; end if;

  v_duplicate := coalesce((v_result->>'duplicate')::boolean, false);

  if v_duplicate and v_payment.metadata ? 'cash_tender_evidence_recorded' then
    if abs(coalesce(v_payment.tendered_amount, v_paid) - v_tendered) > 0.01
       or abs(coalesce(v_payment.change_amount, 0) - v_change) > 0.01 then
      raise exception 'Idempotency key is already used with different cash tender evidence';
    end if;
  end if;

  update public.payments
  set tendered_amount = v_tendered,
      change_amount = v_change,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cash_tender_evidence_recorded', true,
        'tendered_amount', v_tendered,
        'change_amount', v_change
      ),
      updated_at = now()
  where id = v_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  return v_result || jsonb_build_object(
    'tenderedAmount', v_tendered,
    'changeAmount', v_change
  );
end;
$$;

revoke all on function public.restaurant_settle_table_atomic(uuid,text,numeric,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.restaurant_settle_table_atomic(uuid,text,numeric,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) to service_role;

create or replace function public.restaurant_close_table_entity_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_table_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_table public.restaurant_tables%rowtype;
  v_session_ids uuid[] := '{}'::uuid[];
  v_blocking_orders integer := 0;
  v_zero_due_orders integer := 0;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if p_table_id is null then raise exception 'tableId required'; end if;

  perform 1
  from public.legal_entities le
  where le.id = p_entity_id
    and le.organization_id = p_organization_id
    and coalesce(le.is_active, true) = true;
  if not found then
    raise exception 'Selected legal entity is outside the organization or inactive';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':restaurant-table-close:' || p_table_id::text,
      0
    )
  );

  select * into v_table
  from public.restaurant_tables
  where organization_id = p_organization_id
    and id = p_table_id
  for update;

  if not found then raise exception 'Restaurant table not found in this organization'; end if;

  if upper(coalesce(v_table.status, '')) = 'MERGED'
     or exists (
       select 1
       from public.restaurant_table_merges m
       where m.organization_id = p_organization_id
         and (m.master_table_id = p_table_id or m.merged_table_id = p_table_id)
     ) then
    raise exception 'Merged tables must be settled or separated before closure';
  end if;

  if exists (
    select 1
    from public.table_sessions s
    where s.organization_id = p_organization_id
      and s.table_id = p_table_id
      and s.entity_id is distinct from p_entity_id
      and upper(coalesce(s.status, '')) not in ('CLOSED','COMPLETED','CANCELLED')
  ) or exists (
    select 1
    from public.orders o
    where o.organization_id = p_organization_id
      and o.table_id = p_table_id
      and o.entity_id is distinct from p_entity_id
      and upper(coalesce(o.status, '')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED')
  ) then
    raise exception 'This physical table still has active service for another legal entity';
  end if;

  perform 1
  from public.orders o
  where o.organization_id = p_organization_id
    and o.entity_id = p_entity_id
    and o.table_id = p_table_id
  order by o.id
  for update;

  update public.orders o
  set status = 'CLOSED',
      updated_at = v_now
  where o.organization_id = p_organization_id
    and o.entity_id = p_entity_id
    and o.table_id = p_table_id
    and upper(coalesce(o.status, '')) = 'OPEN'
    and greatest(coalesce(o.remaining_balance, coalesce(o.total_amount, o.total, 0) - coalesce(o.amount_paid, 0)), 0) <= 0.01
    and coalesce(o.total_amount, o.total, 0) <= 0.01
    and coalesce(o.amount_paid, 0) <= 0.01
    and upper(coalesce(o.payment_status, 'UNPAID')) = 'UNPAID'
    and not exists (
      select 1
      from public.payments p
      where p.organization_id = p_organization_id
        and p.entity_id = p_entity_id
        and p.order_id = o.id
        and coalesce(p.amount, 0) > 0.01
        and upper(coalesce(p.status, '')) in ('PAID','COMPLETED','SUCCEEDED','SUCCESS','SETTLED','POSTED')
    )
    and exists (
      select 1
      from public.restaurant_order_item_corrections c
      where c.organization_id = p_organization_id
        and c.entity_id = p_entity_id
        and c.order_id = o.id
        and upper(c.correction_type) = 'COMP'
    );

  get diagnostics v_zero_due_orders = row_count;

  select count(*) into v_blocking_orders
  from public.orders o
  where o.organization_id = p_organization_id
    and o.entity_id = p_entity_id
    and o.table_id = p_table_id
    and upper(coalesce(o.status, '')) not in ('CANCELLED','CANCELED','VOID')
    and (
      upper(coalesce(o.status, '')) not in ('COMPLETED','CLOSED')
      or greatest(coalesce(o.remaining_balance, coalesce(o.total_amount, o.total, 0) - coalesce(o.amount_paid, 0)), 0) > 0.01
      or (
        coalesce(o.total_amount, o.total, 0) > 0.01
        and upper(coalesce(o.payment_status, 'UNPAID')) not in ('PAID','SETTLED')
      )
    );

  if v_blocking_orders > 0 then
    raise exception 'Table cannot close while active or unpaid orders remain in the selected legal entity';
  end if;

  select coalesce(array_agg(s.id order by s.created_at, s.id), '{}'::uuid[])
  into v_session_ids
  from public.table_sessions s
  where s.organization_id = p_organization_id
    and s.entity_id = p_entity_id
    and (s.id = v_table.active_session_id or s.table_id = p_table_id)
    and upper(coalesce(s.status, '')) not in ('CLOSED','COMPLETED','CANCELLED');

  if coalesce(array_length(v_session_ids, 1), 0) > 0 then
    perform 1
    from public.table_sessions s
    where s.organization_id = p_organization_id
      and s.entity_id = p_entity_id
      and s.id = any(v_session_ids)
    order by s.id
    for update;

    update public.table_sessions s
    set status = 'CLOSED',
        guest_count = 0,
        guests = 0,
        closed_at = coalesce(s.closed_at, v_now),
        updated_at = v_now
    where s.organization_id = p_organization_id
      and s.entity_id = p_entity_id
      and s.id = any(v_session_ids);
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
    'organizationId', p_organization_id,
    'entityId', p_entity_id,
    'tableId', p_table_id,
    'sessionIds', to_jsonb(v_session_ids),
    'closedSessions', coalesce(array_length(v_session_ids, 1), 0),
    'zeroDueCompOrdersClosed', v_zero_due_orders,
    'status', 'AVAILABLE',
    'actorId', p_actor_id
  );
end;
$$;

revoke all on function public.restaurant_close_table_entity_atomic(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.restaurant_close_table_entity_atomic(uuid,uuid,uuid,uuid) to service_role;

commit;
