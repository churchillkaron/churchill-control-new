create unique index if not exists ux_inventory_documents_production_order_item_consumption
on public.inventory_documents (
  organization_id,
  entity_id,
  source_document_id,
  item_id,
  movement_type
)
where source_module = 'production'
  and source_document in ('order_item','order_items')
  and movement_type = 'CONSUMPTION'
  and source_document_id is not null
  and item_id is not null;

create unique index if not exists ux_inventory_movements_production_order_item_consumption
on public.inventory_movements (
  organization_id,
  entity_id,
  source_document_id,
  item_id,
  type
)
where source_module = 'production'
  and source_document in ('order_item','order_items')
  and type = 'CONSUMPTION'
  and source_document_id is not null
  and item_id is not null;
