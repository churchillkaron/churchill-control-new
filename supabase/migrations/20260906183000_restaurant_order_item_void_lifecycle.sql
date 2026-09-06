begin;

create table if not exists public.restaurant_order_item_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  application_id text not null,
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null references public.order_items(id),
  correction_type text not null,
  original_status text not null,
  original_amount numeric(18,2) not null,
  corrected_amount numeric(18,2) not null default 0,
  reason text not null,
  created_by uuid not null references public.staff_accounts(id),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint restaurant_order_item_corrections_type_check
    check (upper(correction_type) = 'VOID'),
  constraint restaurant_order_item_corrections_original_amount_check
    check (original_amount >= 0),
  constraint restaurant_order_item_corrections_corrected_amount_check
    check (corrected_amount >= 0)
);

create unique index if not exists restaurant_order_item_corrections_idempotency_uidx
  on public.restaurant_order_item_corrections (organization_id, entity_id, idempotency_key);

create unique index if not exists restaurant_order_item_one_void_uidx
  on public.restaurant_order_item_corrections (organization_id, entity_id, order_item_id)
  where upper(correction_type) = 'VOID';

create index if not exists restaurant_order_item_corrections_order_created_idx
  on public.restaurant_order_item_corrections (organization_id, entity_id, order_id, created_at desc);

alter table public.restaurant_order_item_corrections enable row level security;
revoke all on table public.restaurant_order_item_corrections from public, anon, authenticated;
grant all on table public.restaurant_order_item_corrections to service_role;

create or replace function public.restaurant_void_order_item_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_order_id uuid,
  p_order_item_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text,
  p_service_charge_rate numeric,
  p_tax_rate numeric,
  p_prices_include_tax boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_application_id text := lower(pg_catalog.btrim(coalesce(p_application_id, '')));
  v_role text;
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_existing public.restaurant_order_item_corrections%rowtype;
  v_correction public.restaurant_order_item_corrections%rowtype;
  v_service_rate numeric := greatest(coalesce(p_service_charge_rate, 0), 0);
  v_tax_rate numeric := greatest(coalesce(p_tax_rate, 0), 0);
  v_current_subtotal numeric(18,2) := 0;
  v_current_service numeric(18,2) := 0;
  v_current_tax numeric(18,2) := 0;
  v_current_total numeric(18,2) := 0;
  v_new_subtotal numeric(18,2) := 0;
  v_new_service numeric(18,2) := 0;
  v_new_tax numeric(18,2) := 0;
  v_new_total numeric(18,2) := 0;
  v_taxable numeric(18,2) := 0;
  v_item_amount numeric(18,2) := 0;
  v_active_item_count integer := 0;
  v_session_revenue numeric(18,2) := 0;
  v_event_id uuid;
  v_now timestamptz := now();
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organizationId and entityId required';
  end if;
  if v_application_id <> 'restaurant' then
    raise exception 'Restaurant item VOID requires the restaurant application';
  end if;
  if p_order_id is null or p_order_item_id is null then
    raise exception 'orderId and orderItemId required';
  end if;
  if p_actor_id is null then
    raise exception 'Authenticated supervisor required';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Void reason required';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'idempotencyKey required';
  end if;

  perform 1
  from public.legal_entities le
  where le.id = p_entity_id
    and le.organization_id = p_organization_id
    and coalesce(le.is_active, true) = true;
  if not found then
    raise exception 'Selected legal entity is outside the organization or inactive';
  end if;

  select upper(pg_catalog.btrim(coalesce(ou.role, sa.role, p_actor_role, '')))
  into v_role
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id = sa.id
   and ou.organization_id = p_organization_id
   and lower(coalesce(ou.status, 'active')) = 'active'
  where sa.id = p_actor_id
    and coalesce(sa.active, true) = true
    and (sa.active_organization_id = p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last
  limit 1;

  if coalesce(v_role, '') not in (
    'OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN','ADMIN',
    'MANAGER','GENERAL_MANAGER','DUTY_MANAGER','SUPERVISOR','SHIFT_MANAGER',
    'RESTAURANT_MANAGER','VENUE_MANAGER'
  ) then
    raise exception 'Supervisor or owner role required for restaurant item VOID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':restaurant-item-void:' || p_order_item_id::text,
      0
    )
  );

  select * into v_existing
  from public.restaurant_order_item_corrections
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and idempotency_key = pg_catalog.btrim(p_idempotency_key)
  limit 1;

  if found then
    if v_existing.order_id <> p_order_id
       or v_existing.order_item_id <> p_order_item_id
       or upper(v_existing.correction_type) <> 'VOID' then
      raise exception 'Idempotency key is already used by a different restaurant item correction';
    end if;

    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'correction', to_jsonb(v_existing),
      'order', (select to_jsonb(o) from public.orders o where o.id = v_existing.order_id),
      'order_item', (select to_jsonb(i) from public.order_items i where i.id = v_existing.order_item_id),
      'event_id', null
    );
  end if;

  if exists (
    select 1
    from public.restaurant_order_item_corrections c
    where c.organization_id = p_organization_id
      and c.entity_id = p_entity_id
      and c.order_item_id = p_order_item_id
      and upper(c.correction_type) = 'VOID'
  ) then
    raise exception 'Restaurant order item is already voided';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Restaurant order not found in organization and entity scope';
  end if;

  if upper(coalesce(v_order.status, '')) <> 'OPEN' then
    raise exception 'Only an open restaurant order can be voided before payment';
  end if;

  if coalesce(v_order.amount_paid, 0) > 0
     or upper(coalesce(v_order.payment_status, 'UNPAID')) not in ('UNPAID','PENDING','OPEN') then
    raise exception 'Paid or partially paid orders must use the payment correction or refund lifecycle';
  end if;

  if exists (
    select 1
    from public.payments p
    where p.organization_id = p_organization_id
      and p.entity_id = p_entity_id
      and p.order_id = p_order_id
      and coalesce(p.amount, 0) > 0
      and upper(coalesce(p.status, '')) in ('PAID','COMPLETED','SUCCEEDED','SUCCESS','SETTLED','POSTED')
  ) then
    raise exception 'Paid orders must use the payment correction or refund lifecycle';
  end if;

  if abs(coalesce(v_order.discount_amount, 0)) > 0.01
     or abs(coalesce(v_order.discount, 0)) > 0.01 then
    raise exception 'VOID is blocked while the order has a discount; use a governed discount correction lifecycle';
  end if;

  select * into v_item
  from public.order_items
  where id = p_order_item_id
    and order_id = p_order_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Restaurant order item not found in order, organization and entity scope';
  end if;

  if upper(coalesce(v_item.status, 'NEW')) not in ('NEW','PENDING') then
    raise exception 'Only an unstarted restaurant item can be voided; prepared items require COMP or another governed exception';
  end if;

  if exists (
    select 1
    from public.kitchen_tickets kt
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(kt.items) = 'array' then kt.items else '[]'::jsonb end
    ) work_item
    where kt.organization_id = p_organization_id
      and kt.entity_id = p_entity_id
      and kt.order_id = p_order_id
      and coalesce(work_item->>'order_item_id', work_item->>'id') = p_order_item_id::text
      and upper(coalesce(work_item->>'status', 'NEW')) not in ('NEW','PENDING')
  ) or exists (
    select 1
    from public.bar_tickets bt
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(bt.items) = 'array' then bt.items else '[]'::jsonb end
    ) work_item
    where bt.organization_id = p_organization_id
      and bt.entity_id = p_entity_id
      and bt.order_id = p_order_id
      and coalesce(work_item->>'order_item_id', work_item->>'id') = p_order_item_id::text
      and upper(coalesce(work_item->>'status', 'NEW')) not in ('NEW','PENDING')
  ) then
    raise exception 'Kitchen or bar production already started; this item cannot use pre-production VOID';
  end if;

  select round(coalesce(sum(coalesce(i.price, 0) * coalesce(i.quantity, 1)), 0), 2)
  into v_current_subtotal
  from public.order_items i
  where i.organization_id = p_organization_id
    and i.entity_id = p_entity_id
    and i.order_id = p_order_id
    and upper(coalesce(i.status, 'NEW')) not in ('VOID','VOIDED','CANCELLED','CANCELED');

  if abs(v_current_subtotal - coalesce(v_order.subtotal, 0)) > 0.01 then
    raise exception 'Order subtotal is out of sync with active order items; refresh or repair the order before VOID';
  end if;

  v_current_service := round(v_current_subtotal * v_service_rate, 2);
  v_taxable := v_current_subtotal + v_current_service;
  if coalesce(p_prices_include_tax, false) and v_tax_rate > 0 then
    v_current_tax := round(v_taxable - (v_taxable / (1 + v_tax_rate)), 2);
    v_current_total := round(v_taxable, 2);
  else
    v_current_tax := round(v_taxable * v_tax_rate, 2);
    v_current_total := round(v_taxable + v_current_tax, 2);
  end if;

  if abs(v_current_service - coalesce(v_order.service_charge_amount, 0)) > 0.01
     or abs(v_current_tax - coalesce(v_order.vat_amount, 0)) > 0.01
     or abs(v_current_total - coalesce(v_order.total_amount, v_order.total, 0)) > 0.01 then
    raise exception 'Current financial policy no longer matches this order; VOID requires the original tax and service policy';
  end if;

  v_item_amount := round(coalesce(v_item.price, 0) * coalesce(v_item.quantity, 1), 2);

  insert into public.restaurant_order_item_corrections (
    organization_id,
    entity_id,
    application_id,
    order_id,
    order_item_id,
    correction_type,
    original_status,
    original_amount,
    corrected_amount,
    reason,
    created_by,
    idempotency_key,
    metadata
  ) values (
    p_organization_id,
    p_entity_id,
    v_application_id,
    p_order_id,
    p_order_item_id,
    'VOID',
    upper(coalesce(v_item.status, 'NEW')),
    v_item_amount,
    0,
    pg_catalog.btrim(p_reason),
    p_actor_id,
    pg_catalog.btrim(p_idempotency_key),
    jsonb_build_object(
      'service_charge_rate', v_service_rate,
      'tax_rate', v_tax_rate,
      'prices_include_tax', coalesce(p_prices_include_tax, false),
      'preserves_original_item', true,
      'pre_production_only', true,
      'unpaid_only', true
    )
  )
  returning * into v_correction;

  update public.order_items
  set status = 'VOID',
      void_reason = pg_catalog.btrim(p_reason),
      voided_by = p_actor_id::text,
      voided_at = v_now,
      updated_at = v_now
  where id = p_order_item_id
    and order_id = p_order_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  update public.kitchen_tickets kt
  set items = (
        select coalesce(
          jsonb_agg(
            case
              when coalesce(work_item->>'order_item_id', work_item->>'id') = p_order_item_id::text
              then work_item || jsonb_build_object(
                'status', 'VOID',
                'void_reason', pg_catalog.btrim(p_reason),
                'voided_by', p_actor_id,
                'voided_at', v_now
              )
              else work_item
            end
            order by ordinality
          ),
          '[]'::jsonb
        )
        from pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(kt.items) = 'array' then kt.items else '[]'::jsonb end
        ) with ordinality as item_rows(work_item, ordinality)
      ),
      status = case
        when not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case when pg_catalog.jsonb_typeof(kt.items) = 'array' then kt.items else '[]'::jsonb end
          ) remaining
          where coalesce(remaining->>'order_item_id', remaining->>'id') <> p_order_item_id::text
            and upper(coalesce(remaining->>'status', 'NEW')) not in ('VOID','VOIDED','CANCELLED','CANCELED','COMPLETED','SERVED')
        ) then 'VOID'
        else kt.status
      end,
      updated_at = v_now
  where kt.organization_id = p_organization_id
    and kt.entity_id = p_entity_id
    and kt.order_id = p_order_id
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(kt.items) = 'array' then kt.items else '[]'::jsonb end
      ) work_item
      where coalesce(work_item->>'order_item_id', work_item->>'id') = p_order_item_id::text
    );

  update public.bar_tickets bt
  set items = (
        select coalesce(
          jsonb_agg(
            case
              when coalesce(work_item->>'order_item_id', work_item->>'id') = p_order_item_id::text
              then work_item || jsonb_build_object(
                'status', 'VOID',
                'void_reason', pg_catalog.btrim(p_reason),
                'voided_by', p_actor_id,
                'voided_at', v_now
              )
              else work_item
            end
            order by ordinality
          ),
          '[]'::jsonb
        )
        from pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(bt.items) = 'array' then bt.items else '[]'::jsonb end
        ) with ordinality as item_rows(work_item, ordinality)
      ),
      status = case
        when not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case when pg_catalog.jsonb_typeof(bt.items) = 'array' then bt.items else '[]'::jsonb end
          ) remaining
          where coalesce(remaining->>'order_item_id', remaining->>'id') <> p_order_item_id::text
            and upper(coalesce(remaining->>'status', 'NEW')) not in ('VOID','VOIDED','CANCELLED','CANCELED','COMPLETED','SERVED')
        ) then 'VOID'
        else bt.status
      end,
      updated_at = v_now
  where bt.organization_id = p_organization_id
    and bt.entity_id = p_entity_id
    and bt.order_id = p_order_id
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(bt.items) = 'array' then bt.items else '[]'::jsonb end
      ) work_item
      where coalesce(work_item->>'order_item_id', work_item->>'id') = p_order_item_id::text
    );

  select round(coalesce(sum(coalesce(i.price, 0) * coalesce(i.quantity, 1)), 0), 2), count(*)
  into v_new_subtotal, v_active_item_count
  from public.order_items i
  where i.organization_id = p_organization_id
    and i.entity_id = p_entity_id
    and i.order_id = p_order_id
    and upper(coalesce(i.status, 'NEW')) not in ('VOID','VOIDED','CANCELLED','CANCELED');

  v_new_service := round(v_new_subtotal * v_service_rate, 2);
  v_taxable := v_new_subtotal + v_new_service;
  if coalesce(p_prices_include_tax, false) and v_tax_rate > 0 then
    v_new_tax := round(v_taxable - (v_taxable / (1 + v_tax_rate)), 2);
    v_new_total := round(v_taxable, 2);
  else
    v_new_tax := round(v_taxable * v_tax_rate, 2);
    v_new_total := round(v_taxable + v_new_tax, 2);
  end if;

  update public.orders
  set subtotal = v_new_subtotal,
      service_charge_amount = v_new_service,
      vat_amount = v_new_tax,
      total = v_new_total,
      total_amount = v_new_total,
      final_amount = v_new_total,
      remaining_balance = v_new_total,
      status = case when v_active_item_count = 0 then 'VOID' else status end,
      production_status = case when v_active_item_count = 0 then 'VOID' else production_status end,
      updated_at = v_now
  where id = p_order_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  returning * into v_order;

  if v_order.session_id is not null then
    select round(coalesce(sum(coalesce(o.total_amount, o.total, 0)), 0), 2)
    into v_session_revenue
    from public.orders o
    where o.organization_id = p_organization_id
      and o.entity_id = p_entity_id
      and o.session_id = v_order.session_id
      and upper(coalesce(o.status, '')) not in ('CANCELLED','CANCELED','VOID');

    update public.table_sessions s
    set revenue = v_session_revenue,
        orders = (
          select count(*)
          from public.orders o
          where o.organization_id = p_organization_id
            and o.entity_id = p_entity_id
            and o.session_id = v_order.session_id
            and upper(coalesce(o.status, '')) not in ('CANCELLED','CANCELED','VOID')
        ),
        updated_at = v_now
    where s.id = v_order.session_id
      and s.organization_id = p_organization_id
      and s.entity_id = p_entity_id;
  end if;

  insert into public.system_events (
    organization_id,
    type,
    payload,
    processed,
    processing,
    idempotency_key
  ) values (
    p_organization_id,
    'RESTAURANT_ORDER_ITEM_VOIDED',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'application_id', v_application_id,
      'order_id', p_order_id,
      'order_item_id', p_order_item_id,
      'correction_id', v_correction.id,
      'actor_id', p_actor_id,
      'reason', pg_catalog.btrim(p_reason),
      'original_amount', v_item_amount,
      'new_subtotal', v_new_subtotal,
      'new_service_charge_amount', v_new_service,
      'new_tax_amount', v_new_tax,
      'new_total_amount', v_new_total,
      'preserves_original_item', true
    ),
    false,
    false,
    pg_catalog.btrim(p_idempotency_key) || ':event'
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'correction', to_jsonb(v_correction),
    'order', to_jsonb(v_order),
    'order_item', (select to_jsonb(i) from public.order_items i where i.id = p_order_item_id),
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.restaurant_void_order_item_atomic(uuid,uuid,text,uuid,uuid,uuid,text,text,numeric,numeric,boolean,text)
  from public, anon, authenticated;
grant execute on function public.restaurant_void_order_item_atomic(uuid,uuid,text,uuid,uuid,uuid,text,text,numeric,numeric,boolean,text)
  to service_role;

commit;
