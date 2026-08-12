const EXECUTABLE_WAREHOUSE_TASK_TYPES = new Set([
  "PUTAWAY",
  "TRANSFER_OUT",
  "TRANSFER_IN",
]);

function normalized(value) {
  return String(value || "").trim().toUpperCase();
}

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

  if (moduleKey === "warehouse_tasks" && kind === "start") {
    const taskType = normalized(row?.task_type);
    const taskStatus = normalized(row?.status);

    if (
      !EXECUTABLE_WAREHOUSE_TASK_TYPES.has(taskType) ||
      taskStatus !== "ASSIGNED" ||
      !row?.assigned_to
    ) {
      return null;
    }

    return {
      endpoint: "/api/inventory/warehouse/tasks/start",
      method: "POST",
      payload: {
        task_id: row?.id,
        organization_id: organizationId,
        entity_id: row?.entity_id || entityId,
      },
    };
  }

  if (moduleKey === "warehouse_tasks" && kind === "complete") {
    const taskType = normalized(row?.task_type);
    const taskStatus = normalized(row?.status);

    if (
      !EXECUTABLE_WAREHOUSE_TASK_TYPES.has(taskType) ||
      taskStatus !== "IN_PROGRESS"
    ) {
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
