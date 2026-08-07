begin;

create temporary table warehouse_task_movement_duplicates
on commit drop
as
with ranked as (
  select
    movement.id as movement_id,
    movement.document_id,
    movement.organization_id,
    movement.entity_id,
    movement.item_id,
    movement.warehouse_id,
    movement.location_id,
    movement.source_document_id,
    movement.type,
    row_number() over (
      partition by
        movement.organization_id,
        movement.source_module,
        movement.source_document,
        movement.source_document_id,
        movement.type
      order by
        movement.created_at asc,
        movement.id asc
    ) as row_number
  from public.inventory_movements movement
  where movement.source_module = 'warehouse'
    and movement.source_document = 'warehouse_task'
    and movement.source_document_id is not null
)
select
  movement_id,
  document_id,
  organization_id,
  entity_id,
  item_id,
  warehouse_id,
  location_id,
  source_document_id,
  type
from ranked
where row_number > 1;

delete from public.inventory_ledger ledger
using warehouse_task_movement_duplicates duplicate
where ledger.movement_id = duplicate.movement_id;

delete from public.inventory_movements movement
using warehouse_task_movement_duplicates duplicate
where movement.id = duplicate.movement_id;

delete from public.inventory_documents document
using warehouse_task_movement_duplicates duplicate
where document.id = duplicate.document_id
  and not exists (
    select 1
    from public.inventory_movements movement
    where movement.document_id = document.id
  );

with affected_positions as (
  select distinct
    duplicate.organization_id,
    duplicate.entity_id,
    duplicate.item_id,
    duplicate.warehouse_id,
    duplicate.location_id
  from warehouse_task_movement_duplicates duplicate
),
position_balances as (
  select
    affected.organization_id,
    affected.entity_id,
    affected.item_id,
    affected.warehouse_id,
    affected.location_id,
    coalesce(
      sum(
        case
          when upper(trim(movement.type)) in (
            'PURCHASE',
            'GOODS_RECEIPT',
            'PRODUCTION',
            'ADJUSTMENT_IN',
            'TRANSFER_IN',
            'PUTAWAY'
          ) then abs(coalesce(movement.quantity, 0))
          when upper(trim(movement.type)) in (
            'SALE',
            'CONSUMPTION',
            'WASTE',
            'ADJUSTMENT_OUT',
            'TRANSFER_OUT',
            'BATCH_PRODUCTION',
            'USAGE'
          ) then -abs(coalesce(movement.quantity, 0))
          else 0
        end
      ),
      0
    ) as quantity,
    coalesce(
      sum(
        case
          when upper(trim(movement.type)) in (
            'PURCHASE',
            'GOODS_RECEIPT',
            'PRODUCTION',
            'ADJUSTMENT_IN',
            'TRANSFER_IN',
            'PUTAWAY'
          ) then abs(coalesce(movement.total_cost, 0))
          when upper(trim(movement.type)) in (
            'SALE',
            'CONSUMPTION',
            'WASTE',
            'ADJUSTMENT_OUT',
            'TRANSFER_OUT',
            'BATCH_PRODUCTION',
            'USAGE'
          ) then -abs(coalesce(movement.total_cost, 0))
          else 0
        end
      ),
      0
    ) as inventory_value
  from affected_positions affected
  left join public.inventory_movements movement
    on movement.organization_id = affected.organization_id
   and movement.entity_id = affected.entity_id
   and movement.item_id = affected.item_id
   and movement.warehouse_id is not distinct from affected.warehouse_id
   and movement.location_id is not distinct from affected.location_id
  group by
    affected.organization_id,
    affected.entity_id,
    affected.item_id,
    affected.warehouse_id,
    affected.location_id
),
reconciliation as (
  select
    balance.*,
    coalesce(previous.new_quantity, previous.quantity, 0) as previous_quantity
  from position_balances balance
  left join lateral (
    select
      ledger.new_quantity,
      ledger.quantity
    from public.inventory_ledger ledger
    where ledger.organization_id = balance.organization_id
      and ledger.entity_id = balance.entity_id
      and ledger.item_id = balance.item_id
      and ledger.warehouse_id is not distinct from balance.warehouse_id
      and ledger.location_id is not distinct from balance.location_id
    order by ledger.created_at desc
    limit 1
  ) previous on true
)
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
  movement_date
)
select
  reconciliation.organization_id,
  reconciliation.entity_id,
  null,
  null,
  reconciliation.item_id,
  reconciliation.warehouse_id,
  reconciliation.location_id,
  'LEDGER_RECALCULATION',
  reconciliation.quantity,
  reconciliation.previous_quantity,
  reconciliation.quantity,
  'WAREHOUSE_INTEGRITY_REPAIR',
  null,
  case
    when reconciliation.quantity > 0
      then reconciliation.inventory_value / reconciliation.quantity
    else 0
  end,
  reconciliation.inventory_value,
  now()
from reconciliation;

create unique index if not exists ux_inventory_movements_warehouse_task_type
on public.inventory_movements (
  organization_id,
  source_module,
  source_document,
  source_document_id,
  type
)
where source_module = 'warehouse'
  and source_document = 'warehouse_task'
  and source_document_id is not null;

commit;
