-- Converge purchase-order receiving on one atomic database transaction.
-- Finance remains post-commit through the canonical financeGateway.

alter table public.goods_receipts
  drop constraint if exists goods_receipts_grn_number_key;

create unique index if not exists ux_goods_receipts_organization_grn_number
  on public.goods_receipts (organization_id, grn_number)
  where organization_id is not null and grn_number is not null;

create index if not exists idx_goods_receipts_org_purchase_order_created
  on public.goods_receipts (organization_id, purchase_order_id, created_at desc)
  where purchase_order_id is not null;

create index if not exists idx_goods_receipt_items_receipt
  on public.goods_receipt_items (goods_receipt_id);

create index if not exists idx_goods_receipt_items_purchase_order_item
  on public.goods_receipt_items (purchase_order_item_id)
  where purchase_order_item_id is not null;

create or replace function public.receive_purchase_order_atomic_rpc(
  p_organization_id uuid,
  p_entity_id uuid,
  p_purchase_order_id uuid,
  p_received_by text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_po record;
  v_receipt record;
  v_item record;
  v_document record;
  v_movement record;
  v_task record;
  v_resolved_entity_id uuid;
  v_grn_number text;
  v_next_grn bigint;
  v_received_quantity numeric;
  v_unit_cost numeric;
  v_total_cost numeric;
  v_global_quantity numeric;
  v_global_value numeric;
  v_position_quantity numeric;
  v_position_value numeric;
  v_previous_quantity numeric;
  v_average_unit_cost numeric;
  v_layer_quantity numeric;
  v_layer_value numeric;
  v_layer_average numeric;
  v_now timestamptz := clock_timestamp();
  v_tasks jsonb := '[]'::jsonb;
  v_movements jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'organization_id required' using errcode = '22023';
  end if;
  if p_purchase_order_id is null then
    raise exception 'purchase_order_id required' using errcode = '22023';
  end if;
  if p_actor_id is null then
    raise exception 'actor_id required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'procurement:receive:' || p_organization_id::text || ':' || p_purchase_order_id::text,
      0
    )
  );

  select po.*
  into v_po
  from public.purchase_orders po
  where po.organization_id = p_organization_id
    and po.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'PURCHASE_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_resolved_entity_id := coalesce(v_po.entity_id, p_entity_id);

  if v_resolved_entity_id is null then
    raise exception 'entity_id required' using errcode = '22023';
  end if;

  if v_po.entity_id is not null
     and p_entity_id is not null
     and v_po.entity_id <> p_entity_id then
    raise exception 'purchase order belongs to a different legal entity' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.legal_entities le
    where le.organization_id = p_organization_id
      and le.id = v_resolved_entity_id
      and coalesce(le.is_active, true)
  ) then
    raise exception 'legal entity is unavailable for organization' using errcode = 'P0001';
  end if;

  if upper(coalesce(v_po.status, '')) = 'RECEIVED' then
    select gr.*
    into v_receipt
    from public.goods_receipts gr
    where gr.organization_id = p_organization_id
      and gr.purchase_order_id = p_purchase_order_id
    order by gr.created_at asc, gr.id asc
    limit 1;

    if not found then
      raise exception 'PURCHASE_ORDER_RECEIVED_WITHOUT_GOODS_RECEIPT' using errcode = 'P0001';
    end if;

    select coalesce(jsonb_agg(to_jsonb(wt) order by wt.created_at, wt.id), '[]'::jsonb)
    into v_tasks
    from public.warehouse_tasks wt
    where wt.organization_id = p_organization_id
      and wt.source_document = 'goods_receipts'
      and wt.source_document_id = v_receipt.id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'movement', to_jsonb(im),
          'document', to_jsonb(idoc)
        )
        order by im.movement_date, im.created_at, im.id
      ),
      '[]'::jsonb
    )
    into v_movements
    from public.inventory_movements im
    join public.inventory_documents idoc
      on idoc.id = im.document_id
     and idoc.organization_id = im.organization_id
    where im.organization_id = p_organization_id
      and im.source_module = 'procurement'
      and im.source_document = 'goods_receipts'
      and im.source_document_id = v_receipt.id;

    return jsonb_build_object(
      'success', true,
      'reused', true,
      'goods_receipt', to_jsonb(v_receipt),
      'purchase_order', to_jsonb(v_po),
      'warehouse_tasks', v_tasks,
      'inventory_movements', v_movements
    );
  end if;

  if upper(coalesce(v_po.status, '')) <> 'APPROVED' then
    raise exception 'PURCHASE_ORDER_NOT_APPROVED: %', coalesce(v_po.status, '(null)') using errcode = 'P0001';
  end if;

  if v_po.warehouse_id is null then
    raise exception 'purchase order warehouse_id required for receiving' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.inventory_warehouses iw
    where iw.id = v_po.warehouse_id
      and iw.organization_id = p_organization_id
  ) then
    raise exception 'purchase order warehouse does not belong to organization' using errcode = 'P0001';
  end if;

  perform 1
  from public.purchase_order_items poi
  where poi.purchase_order_id = p_purchase_order_id
  order by poi.id
  for update;

  if not exists (
    select 1
    from public.purchase_order_items poi
    where poi.purchase_order_id = p_purchase_order_id
      and coalesce(poi.qty, 0) > 0
  ) then
    raise exception 'PURCHASE_ORDER_HAS_NO_RECEIVABLE_ITEMS' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.purchase_order_items poi
    where poi.purchase_order_id = p_purchase_order_id
      and poi.organization_id is not null
      and poi.organization_id <> p_organization_id
  ) then
    raise exception 'purchase order item belongs to a different organization' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.purchase_order_items poi
    where poi.purchase_order_id = p_purchase_order_id
      and poi.entity_id is not null
      and poi.entity_id <> v_resolved_entity_id
  ) then
    raise exception 'purchase order item belongs to a different legal entity' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.purchase_order_items poi
    where poi.purchase_order_id = p_purchase_order_id
      and coalesce(poi.qty, 0) > 0
      and coalesce(poi.unit_price, 0) < 0
  ) then
    raise exception 'purchase order item unit_price must be non-negative' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.purchase_order_items poi
    left join public.inventory_items ii
      on ii.id = poi.item_id
    where poi.purchase_order_id = p_purchase_order_id
      and coalesce(poi.qty, 0) > 0
      and poi.item_id is not null
      and (
        ii.id is null
        or ii.organization_id is distinct from p_organization_id
        or (ii.entity_id is not null and ii.entity_id <> v_resolved_entity_id)
      )
  ) then
    raise exception 'purchase order inventory item is outside organization/entity scope' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'procurement:grn:' || p_organization_id::text,
      0
    )
  );

  select coalesce(
    max(substring(gr.grn_number from '^GRN-([0-9]+)$')::bigint),
    0
  ) + 1
  into v_next_grn
  from public.goods_receipts gr
  where gr.organization_id = p_organization_id
    and gr.grn_number ~ '^GRN-[0-9]+$';

  v_grn_number := 'GRN-' || lpad(v_next_grn::text, 8, '0');

  insert into public.goods_receipts (
    organization_id,
    entity_id,
    grn_number,
    purchase_order_id,
    supplier_party_id,
    warehouse_id,
    received_by,
    status,
    received_date,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    v_resolved_entity_id,
    v_grn_number,
    v_po.id,
    v_po.supplier_party_id,
    v_po.warehouse_id,
    coalesce(nullif(btrim(p_received_by), ''), 'WAREHOUSE'),
    'RECEIVED',
    v_now::date,
    v_now,
    v_now
  )
  returning * into v_receipt;

  for v_item in
    select poi.*
    from public.purchase_order_items poi
    where poi.purchase_order_id = p_purchase_order_id
      and coalesce(poi.qty, 0) > 0
    order by poi.item_id nulls last, poi.id
  loop
    v_received_quantity := v_item.qty;
    v_unit_cost := coalesce(v_item.unit_price, 0);
    v_total_cost := round(v_received_quantity * v_unit_cost, 4);

    insert into public.goods_receipt_items (
      organization_id,
      entity_id,
      goods_receipt_id,
      purchase_order_item_id,
      item_id,
      item_name,
      ordered_qty,
      received_qty,
      damaged_qty,
      accepted_qty,
      created_at
    ) values (
      p_organization_id,
      v_resolved_entity_id,
      v_receipt.id,
      v_item.id,
      v_item.item_id,
      v_item.item_name,
      v_item.qty,
      v_received_quantity,
      0,
      v_received_quantity,
      v_now
    );

    update public.purchase_order_items
    set received_qty = v_received_quantity,
        organization_id = coalesce(organization_id, p_organization_id),
        entity_id = coalesce(entity_id, v_resolved_entity_id)
    where id = v_item.id
      and purchase_order_id = p_purchase_order_id;

    if v_item.item_id is null then
      continue;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'inventory:item:' || p_organization_id::text || ':' || v_resolved_entity_id::text || ':' || v_item.item_id::text,
        0
      )
    );

    insert into public.warehouse_tasks (
      organization_id,
      entity_id,
      warehouse_id,
      task_type,
      source_document,
      source_document_id,
      item_id,
      quantity,
      status,
      created_by,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_resolved_entity_id,
      v_po.warehouse_id,
      'PUTAWAY',
      'goods_receipts',
      v_receipt.id,
      v_item.item_id,
      v_received_quantity,
      'OPEN',
      p_actor_id,
      v_now,
      v_now
    )
    returning * into v_task;

    insert into public.inventory_documents (
      organization_id,
      entity_id,
      document_type,
      status,
      movement_type,
      item_id,
      warehouse_id,
      location_id,
      quantity,
      unit_cost,
      total_cost,
      source_module,
      source_document,
      source_document_id,
      movement_date,
      notes,
      created_by,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_resolved_entity_id,
      'INVENTORY_MOVEMENT',
      'POSTED',
      'GOODS_RECEIPT',
      v_item.item_id,
      v_po.warehouse_id,
      null,
      v_received_quantity,
      v_unit_cost,
      v_total_cost,
      'procurement',
      'goods_receipts',
      v_receipt.id,
      v_now,
      'Goods receipt ' || v_grn_number,
      p_actor_id,
      v_now,
      v_now
    )
    returning * into v_document;

    insert into public.inventory_movements (
      organization_id,
      entity_id,
      document_id,
      item_id,
      warehouse_id,
      location_id,
      quantity,
      type,
      unit_cost,
      total_cost,
      notes,
      reference_id,
      movement_date,
      source_module,
      source_document,
      source_document_id,
      created_at
    ) values (
      p_organization_id,
      v_resolved_entity_id,
      v_document.id,
      v_item.item_id,
      v_po.warehouse_id,
      null,
      v_received_quantity,
      'GOODS_RECEIPT',
      v_unit_cost,
      v_total_cost,
      'Goods receipt ' || v_grn_number,
      v_receipt.id::text,
      v_now,
      'procurement',
      'goods_receipts',
      v_receipt.id,
      v_now::timestamp without time zone
    )
    returning * into v_movement;

    insert into public.inventory_cost_layers (
      organization_id,
      entity_id,
      document_id,
      movement_id,
      item_id,
      quantity_received,
      quantity_remaining,
      unit_cost,
      total_cost,
      source_type,
      source_id,
      received_at,
      created_at
    ) values (
      p_organization_id,
      v_resolved_entity_id,
      v_document.id,
      v_movement.id,
      v_item.item_id,
      v_received_quantity,
      v_received_quantity,
      v_unit_cost,
      v_total_cost,
      'goods_receipts',
      v_receipt.id,
      v_now,
      v_now
    );

    select
      coalesce(sum(public.inventory_signed_quantity(im.type, im.quantity)), 0),
      coalesce(sum(
        case
          when public.inventory_signed_quantity(im.type, im.quantity) > 0
            then coalesce(im.total_cost, 0)
          when public.inventory_signed_quantity(im.type, im.quantity) < 0
            then -abs(coalesce(im.total_cost, 0))
          else 0
        end
      ), 0)
    into v_global_quantity, v_global_value
    from public.inventory_movements im
    where im.organization_id = p_organization_id
      and im.entity_id = v_resolved_entity_id
      and im.item_id = v_item.item_id;

    select
      coalesce(sum(public.inventory_signed_quantity(im.type, im.quantity)), 0),
      coalesce(sum(
        case
          when public.inventory_signed_quantity(im.type, im.quantity) > 0
            then coalesce(im.total_cost, 0)
          when public.inventory_signed_quantity(im.type, im.quantity) < 0
            then -abs(coalesce(im.total_cost, 0))
          else 0
        end
      ), 0)
    into v_position_quantity, v_position_value
    from public.inventory_movements im
    where im.organization_id = p_organization_id
      and im.entity_id = v_resolved_entity_id
      and im.item_id = v_item.item_id
      and im.warehouse_id is not distinct from v_po.warehouse_id
      and im.location_id is null;

    select coalesce(il.new_quantity, il.quantity, 0)
    into v_previous_quantity
    from public.inventory_ledger il
    where il.organization_id = p_organization_id
      and il.entity_id = v_resolved_entity_id
      and il.item_id = v_item.item_id
      and il.warehouse_id is not distinct from v_po.warehouse_id
      and il.location_id is null
    order by il.created_at desc, il.id desc
    limit 1;

    v_previous_quantity := coalesce(v_previous_quantity, 0);
    v_average_unit_cost := case
      when v_global_quantity > 0 then v_global_value / v_global_quantity
      else 0
    end;

    insert into public.inventory_ledger (
      organization_id,
      entity_id,
      document_id,
      movement_id,
      item_id,
      warehouse_id,
      location_id,
      movement_type,
      quantity,
      previous_quantity,
      new_quantity,
      reference_type,
      reference_id,
      unit_cost,
      total_cost,
      movement_date,
      created_at
    ) values (
      p_organization_id,
      v_resolved_entity_id,
      v_document.id,
      v_movement.id,
      v_item.item_id,
      v_po.warehouse_id,
      null,
      'LEDGER_RECALCULATION',
      v_position_quantity,
      v_previous_quantity,
      v_position_quantity,
      'INVENTORY_MOVEMENT',
      v_movement.id,
      v_average_unit_cost,
      v_position_value,
      v_now,
      v_now
    );

    select
      coalesce(sum(icl.quantity_remaining), 0),
      coalesce(sum(icl.quantity_remaining * icl.unit_cost), 0)
    into v_layer_quantity, v_layer_value
    from public.inventory_cost_layers icl
    where icl.organization_id = p_organization_id
      and icl.entity_id = v_resolved_entity_id
      and icl.item_id = v_item.item_id;

    v_layer_average := case
      when v_layer_quantity > 0 then v_layer_value / v_layer_quantity
      else 0
    end;

    insert into public.inventory_valuation_snapshots (
      organization_id,
      entity_id,
      item_id,
      quantity_on_hand,
      inventory_value,
      average_unit_cost,
      snapshot_date,
      created_at
    ) values (
      p_organization_id,
      v_resolved_entity_id,
      v_item.item_id,
      v_layer_quantity,
      v_layer_value,
      v_layer_average,
      v_now::date,
      v_now
    );
  end loop;

  update public.purchase_orders
  set status = 'RECEIVED',
      entity_id = coalesce(entity_id, v_resolved_entity_id),
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_purchase_order_id
  returning * into v_po;

  select coalesce(jsonb_agg(to_jsonb(wt) order by wt.created_at, wt.id), '[]'::jsonb)
  into v_tasks
  from public.warehouse_tasks wt
  where wt.organization_id = p_organization_id
    and wt.source_document = 'goods_receipts'
    and wt.source_document_id = v_receipt.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'movement', to_jsonb(im),
        'document', to_jsonb(idoc)
      )
      order by im.movement_date, im.created_at, im.id
    ),
    '[]'::jsonb
  )
  into v_movements
  from public.inventory_movements im
  join public.inventory_documents idoc
    on idoc.id = im.document_id
   and idoc.organization_id = im.organization_id
  where im.organization_id = p_organization_id
    and im.source_module = 'procurement'
    and im.source_document = 'goods_receipts'
    and im.source_document_id = v_receipt.id;

  return jsonb_build_object(
    'success', true,
    'reused', false,
    'goods_receipt', to_jsonb(v_receipt),
    'purchase_order', to_jsonb(v_po),
    'warehouse_tasks', v_tasks,
    'inventory_movements', v_movements
  );
end;
$$;

revoke all on function public.receive_purchase_order_atomic_rpc(uuid, uuid, uuid, text, uuid) from public;
revoke all on function public.receive_purchase_order_atomic_rpc(uuid, uuid, uuid, text, uuid) from anon;
revoke all on function public.receive_purchase_order_atomic_rpc(uuid, uuid, uuid, text, uuid) from authenticated;
grant execute on function public.receive_purchase_order_atomic_rpc(uuid, uuid, uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';