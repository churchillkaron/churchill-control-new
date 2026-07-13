export function resolveRowAction({
  moduleKey,
  action,
  row,
  organizationId,
  entityId,
}) {

  const kind =
    String(
      action?.action ||
      action?.type ||
      action?.id ||
      ""
    )
      .toLowerCase()
      .replace(/-/g, "_");


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


  if (
    moduleKey === "connected_services" &&
    [
      "complete_connection",
      "connect_service",
      "disconnect_service",
    ].includes(kind)
  ) {

    return {

      endpoint:
        action.endpoint,

      method:
        action.method ||
        "POST",

      payload: {

        provider_id:
          row?.provider_id ||
          row?.id ||
          null,

        organization_id:
          organizationId,

      },

    };

  }


  return null;

}
