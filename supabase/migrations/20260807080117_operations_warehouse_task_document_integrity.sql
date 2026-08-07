create unique index if not exists ux_inventory_documents_warehouse_task_type
on public.inventory_documents (
  organization_id,
  source_module,
  source_document,
  source_document_id,
  movement_type
)
where source_module = 'warehouse'
  and source_document = 'warehouse_task'
  and source_document_id is not null;
