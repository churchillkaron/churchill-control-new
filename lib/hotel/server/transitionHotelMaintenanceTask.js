const MAINTENANCE_TRANSITIONS = Object.freeze({
  START: Object.freeze({
    fromStatus: "PENDING",
    toStatus: "IN_PROGRESS",
  }),
  COMPLETE: Object.freeze({
    fromStatus: "IN_PROGRESS",
    toStatus: "COMPLETED",
  }),
});

class HotelMaintenanceTransitionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "HotelMaintenanceTransitionError";
    this.status = status;
  }
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new HotelMaintenanceTransitionError(
      `${label} is required`,
      400
    );
  }

  return normalized;
}

export async function transitionHotelMaintenanceTask({
  supabase,
  organizationId,
  taskId,
  action,
}) {
  if (!supabase) {
    throw new HotelMaintenanceTransitionError(
      "Server database connection is required",
      500
    );
  }

  const scopedOrganizationId = requireValue(
    organizationId,
    "organizationId"
  );
  const scopedTaskId = requireValue(
    taskId,
    "taskId"
  );
  const normalizedAction = requireValue(
    action,
    "action"
  ).toUpperCase();
  const transition = MAINTENANCE_TRANSITIONS[normalizedAction];

  if (!transition) {
    throw new HotelMaintenanceTransitionError(
      `Unsupported maintenance action: ${normalizedAction}`,
      400
    );
  }

  const {
    data: task,
    error: taskError,
  } = await supabase
    .from("hotel_maintenance_tasks")
    .select("id, organization_id, property_id, status")
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedTaskId)
    .maybeSingle();

  if (taskError) {
    throw taskError;
  }

  if (!task) {
    throw new HotelMaintenanceTransitionError(
      "Maintenance task not found for this organization",
      404
    );
  }

  const currentStatus = String(task.status || "").toUpperCase();

  if (currentStatus !== transition.fromStatus) {
    throw new HotelMaintenanceTransitionError(
      `Task must be ${transition.fromStatus} before ${normalizedAction}`,
      409
    );
  }

  const {
    data: updatedTask,
    error: updateError,
  } = await supabase
    .from("hotel_maintenance_tasks")
    .update({
      status: transition.toStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedTaskId)
    .eq("status", transition.fromStatus)
    .select()
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!updatedTask) {
    throw new HotelMaintenanceTransitionError(
      "Maintenance state changed before the transition completed",
      409
    );
  }

  return updatedTask;
}

export {
  MAINTENANCE_TRANSITIONS,
  HotelMaintenanceTransitionError,
};

export default transitionHotelMaintenanceTask;
