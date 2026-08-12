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
  if (moduleKey === "warehouse_tasks" && kind === "assign") {
    return {
      endpoint: "/api/inventory/warehouse/tasks/assign",
      method: "POST",
      payload: {
        task_id: row?.id,
        organization_id: organizationId,
        entity_id: row?.entity_id || entityId,
      },
    };
  }

  if (moduleKey === "warehouse_tasks" && kind === "complete") {
    const taskType = String(row?.task_type || "").trim().toUpperCase();

    if (!EXECUTABLE_WAREHOUSE_TASK_TYPES.has(taskType)) {
      return null;
    }

    const movementLocationLabel =
      taskType === "TRANSFER_OUT" ? "Source Location" : "Destination Location";

    return {
      endpoint: "/api/inventory/warehouse/tasks/complete",
      method: "POST",
      payload: {
        task_id: row?.id,
        organization_id: organizationId,
        entity_id: row?.entity_id || entityId,
        location_id: row?.location_id || null,
      },
      title:
        taskType === "PUTAWAY"
          ? "Complete Putaway"
          : taskType === "TRANSFER_OUT"
            ? "Complete Transfer Out"
            : "Complete Transfer In",
      submitLabel: "Complete",
      schema: [
        {
          name: "location_id",
          label: movementLocationLabel,
          type: "lookup",
          lookup: "inventory_locations",
          required: true,
          width: "full",
        },
      ],
    };
  }

  return null;
}
