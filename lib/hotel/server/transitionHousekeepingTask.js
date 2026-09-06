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

function governedTransitionMessage(error) {
  const message = String(error?.message || error?.details || error?.hint || "").trim();
  const known = [
    "Housekeeping task not found for this organization",
    "Housekeeping room was not found for this organization",
    "Task must be PENDING before START",
    "Task must be IN_PROGRESS before COMPLETE",
    "Task must be AWAITING_INSPECTION before INSPECT",
    "Room must be DIRTY before START",
    "Room must be CLEANING or DIRTY before COMPLETE",
    "Room must be CLEAN before INSPECT",
    "Room still has unresolved or unclassified maintenance and cannot be released to Front Desk",
    "Room still has another active Housekeeping task and cannot be released to Front Desk",
    "Room is still assigned to an in-house stay and cannot be released to Front Desk",
    "Unsupported housekeeping action",
  ];
  return known.find((entry) => message.includes(entry)) ? message : null;
}

export async function transitionHousekeepingTask({ supabase, organizationId, taskId, action }) {
  if (!supabase) throw new HousekeepingTransitionError("Server database connection is required", 500);

  const scopedOrganizationId = requireValue(organizationId, "organizationId");
  const scopedTaskId = requireValue(taskId, "taskId");
  const normalizedAction = requireValue(action, "action").toUpperCase();

  const { data, error } = await supabase.rpc("hotel_transition_housekeeping_task", {
    p_organization_id: scopedOrganizationId,
    p_task_id: scopedTaskId,
    p_action: normalizedAction,
  });

  if (error) {
    const governed = governedTransitionMessage(error);
    if (governed) throw new HousekeepingTransitionError(governed, 409);
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new HousekeepingTransitionError("Housekeeping transition returned no task", 409);
  return row;
}

export {
  HousekeepingTransitionError,
};

export default transitionHousekeepingTask;
