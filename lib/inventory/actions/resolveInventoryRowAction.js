export function resolveInventoryRowAction({
  moduleKey,
  row,
  organizationId,
  entityId,
  kind,
}) {

  if (
    moduleKey === "warehouse_tasks" &&
    kind === "assign"
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
          entityId,
      },
    };

  }


  if (
    moduleKey === "warehouse_tasks" &&
    kind === "complete"
  ) {

    return {
      endpoint:
        "/api/inventory/warehouse/tasks/complete",

      method:
        "POST",

      payload: {
        task_id:
          row?.id,

        organization_id:
          organizationId,

        entity_id:
          row?.entity_id ||
          entityId,

        location_id:
          row?.location_id ||
          null,
      },
    };

  }


  return null;

}
