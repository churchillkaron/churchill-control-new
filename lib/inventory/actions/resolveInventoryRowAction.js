const EXECUTABLE_WAREHOUSE_TASK_TYPES = new Set([
  "PUTAWAY",
  "TRANSFER_OUT",
  "TRANSFER_IN",
]);

export function resolveInventoryRowAction({
  moduleKey,
  row,
  organizationId,
  entityId,
  kind,
}) {
  if (
    moduleKey ===
      "warehouse_tasks" &&
    kind ===
      "assign"
  ) {
    return {
      endpoint:
        "/api/inventory/warehouse/tasks/assign",

      method:
        "POST",

      payload: {
        task_id:
          row?.id,

        organization_id:
          organizationId,

        entity_id:
          row?.entity_id ||