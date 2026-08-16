begin;

create unique index if not exists inventory_movements_shopify_sync_source_uidx
  on public.inventory_movements (
    organization_id,
    entity_id,
    source_document_id
  )
  where source_module = 'shopify_inventory_sync'
    and source_document_id is not null;

commit;
