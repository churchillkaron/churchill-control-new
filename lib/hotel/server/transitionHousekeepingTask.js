const HOUSEKEEPING_TRANSITIONS = Object.freeze({
  START: Object.freeze({
    fromStatus: "PENDING",
    toStatus: "IN_PROGRESS",
  }),
  COMPLETE: Object.freeze({
    fromStatus: "IN_PROGRESS",
    toStatus: "COMPLETED",
    roomStatus: "AVAILABLE",
  }),
});

class HousekeepingTransitionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "HousekeepingTransitionError";
    this.status = status;
  }
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new HousekeepingTransitionError(
      `${label} is required`,
      400
    );
  }

  return normalized;
}

export async function transitionHousekeepingTask({
  supabase,
  organizationId,
  taskId,
  action,
}) {
  if (!supabase) {
    throw new HousekeepingTransitionError(
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
  const transition = HOUSEKEEPING_TRANSITIONS[normalizedAction];

  if (!transition) {
    throw new HousekeepingTransitionError(
      `Unsupported housekeeping action: ${normalizedAction}`,
      400
    );
  }

  const {
    data: task,
    error: taskError,
  } = await supabase
    .from("hotel_housekeeping_tasks")
    .select(`
      id,
      organization_id,
      room_id,
      task_type,
      task_status,
      scheduled_at
    `)
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedTaskId)
    .maybeSingle();

  if (taskError) {
    throw taskError;
  }

  if (!task) {
    throw new HousekeepingTransitionError(
      "Housekeeping task not found for this organization",
      404
    );
  }

  const currentStatus = String(
    task.task_status || ""
  ).toUpperCase();

  if (currentStatus !== transition.fromStatus) {
    throw new HousekeepingTransitionError(
      `Task must be ${transition.fromStatus} before ${normalizedAction}`,
      409
    );
  }

  const changedAt = new Date().toISOString();

  const {
    data: updatedTask,
    error: updateError,
  } = await supabase
    .from("hotel_housekeeping_tasks")
    .update({
      task_status: transition.toStatus,
      updated_at: changedAt,
    })
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedTaskId)
    .eq("task_status", transition.fromStatus)
    .select(`
      *,
      hotel_rooms (
        room_number,
        room_type,
        status
      )
    `)
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!updatedTask) {
    throw new HousekeepingTransitionError(
      "Housekeeping state changed before the transition completed",
      409
    );
  }

  if (
    transition.roomStatus &&
    task.room_id
  ) {
    const { error: roomError } = await supabase
      .from("hotel_rooms")
      .update({
        status: transition.roomStatus,
        updated_at: changedAt,
      })
      .eq("organization_id", scopedOrganizationId)
      .eq("id", task.room_id)
      .eq("status", "DIRTY");

    if (roomError) {
      throw roomError;
    }
  }

  return updatedTask;
}

export {
  HOUSEKEEPING_TRANSITIONS,
  HousekeepingTransitionError,
};

export default transitionHousekeepingTask;
