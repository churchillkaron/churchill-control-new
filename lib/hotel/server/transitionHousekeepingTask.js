const CLEANING_TRANSITIONS = Object.freeze({
  START: Object.freeze({ fromStatus: "PENDING", toStatus: "IN_PROGRESS", fromRoomStatuses: Object.freeze(["DIRTY"]), roomStatus: "CLEANING" }),
  COMPLETE: Object.freeze({ fromStatus: "IN_PROGRESS", toStatus: "AWAITING_INSPECTION", fromRoomStatuses: Object.freeze(["CLEANING", "DIRTY"]), roomStatus: "CLEAN" }),
  INSPECT: Object.freeze({ fromStatus: "AWAITING_INSPECTION", toStatus: "COMPLETED", fromRoomStatuses: Object.freeze(["CLEAN"]), roomStatus: "AVAILABLE", completesTask: true }),
});

const GENERIC_TRANSITIONS = Object.freeze({
  START: Object.freeze({ fromStatus: "PENDING", toStatus: "IN_PROGRESS" }),
  COMPLETE: Object.freeze({ fromStatus: "IN_PROGRESS", toStatus: "COMPLETED", completesTask: true }),
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
  if (!normalized) throw new HousekeepingTransitionError(`${label} is required`, 400);
  return normalized;
}

function normalizedStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function transitionFor(task, action) {
  const cleaning = normalizedStatus(task?.task_type) === "CLEANING";
  const transition = (cleaning ? CLEANING_TRANSITIONS : GENERIC_TRANSITIONS)[action];
  if (!transition) throw new HousekeepingTransitionError(`Unsupported housekeeping action: ${action}`, 400);
  return { cleaning, transition };
}

async function moveRoomState({ supabase, organizationId, roomId, transition, changedAt }) {
  if (!roomId || !transition.roomStatus) return null;

  const { data: room, error: roomError } = await supabase
    .from("hotel_rooms")
    .select("id,status")
    .eq("organization_id", organizationId)
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!room) throw new HousekeepingTransitionError("Housekeeping room was not found for this organization", 404);

  const roomStatus = normalizedStatus(room.status);
  if (!transition.fromRoomStatuses.includes(roomStatus)) {
    throw new HousekeepingTransitionError(`Room must be ${transition.fromRoomStatuses.join(" or ")} before this housekeeping move; current state is ${roomStatus || "UNKNOWN"}`, 409);
  }

  const { data: updatedRoom, error: updateError } = await supabase
    .from("hotel_rooms")
    .update({ status: transition.roomStatus, updated_at: changedAt })
    .eq("organization_id", organizationId)
    .eq("id", roomId)
    .eq("status", roomStatus)
    .select("id,status")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updatedRoom) throw new HousekeepingTransitionError("Room state changed before housekeeping could complete this move", 409);

  return { previousStatus: roomStatus, nextStatus: transition.roomStatus };
}

async function restoreRoomState({ supabase, organizationId, roomId, transitionState }) {
  if (!roomId || !transitionState) return;
  const { error } = await supabase
    .from("hotel_rooms")
    .update({ status: transitionState.previousStatus, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", roomId)
    .eq("status", transitionState.nextStatus);
  if (error) console.error("HOTEL_HOUSEKEEPING_ROOM_ROLLBACK_FAILED", { organizationId, roomId, error: error.message });
}

export async function transitionHousekeepingTask({ supabase, organizationId, taskId, action }) {
  if (!supabase) throw new HousekeepingTransitionError("Server database connection is required", 500);

  const scopedOrganizationId = requireValue(organizationId, "organizationId");
  const scopedTaskId = requireValue(taskId, "taskId");
  const normalizedAction = requireValue(action, "action").toUpperCase();

  const { data: task, error: taskError } = await supabase
    .from("hotel_housekeeping_tasks")
    .select("id,organization_id,room_id,task_type,task_status,scheduled_at,completed_at,updated_at")
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedTaskId)
    .maybeSingle();
  if (taskError) throw taskError;
  if (!task) throw new HousekeepingTransitionError("Housekeeping task not found for this organization", 404);

  const { cleaning, transition } = transitionFor(task, normalizedAction);
  const currentStatus = normalizedStatus(task.task_status);
  if (currentStatus !== transition.fromStatus) {
    throw new HousekeepingTransitionError(`Task must be ${transition.fromStatus} before ${normalizedAction}`, 409);
  }
  if (cleaning && !task.room_id) throw new HousekeepingTransitionError("Cleaning task has no governed room to transition", 409);

  const changedAt = new Date().toISOString();
  const roomTransition = cleaning
    ? await moveRoomState({ supabase, organizationId: scopedOrganizationId, roomId: task.room_id, transition, changedAt })
    : null;

  const taskPatch = { task_status: transition.toStatus, updated_at: changedAt };
  if (transition.completesTask) taskPatch.completed_at = changedAt;

  const { data: updatedTask, error: updateError } = await supabase
    .from("hotel_housekeeping_tasks")
    .update(taskPatch)
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedTaskId)
    .eq("task_status", transition.fromStatus)
    .select(`*, hotel_rooms (room_number, room_type, status)`)
    .maybeSingle();

  if (updateError || !updatedTask) {
    await restoreRoomState({ supabase, organizationId: scopedOrganizationId, roomId: task.room_id, transitionState: roomTransition });
    if (updateError) throw updateError;
    throw new HousekeepingTransitionError("Housekeeping state changed before the transition completed", 409);
  }

  return updatedTask;
}

export {
  CLEANING_TRANSITIONS as HOUSEKEEPING_TRANSITIONS,
  GENERIC_TRANSITIONS,
  HousekeepingTransitionError,
};

export default transitionHousekeepingTask;
