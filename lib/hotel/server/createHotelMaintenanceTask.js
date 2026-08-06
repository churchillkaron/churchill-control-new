const ALLOWED_MAINTENANCE_TYPES = Object.freeze([
  "REPAIR",
  "INSPECTION",
  "PREVENTIVE",
  "SAFETY",
]);

class HotelMaintenanceTaskError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "HotelMaintenanceTaskError";
    this.status = status;
  }
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new HotelMaintenanceTaskError(
      `${label} is required`,
      400
    );
  }

  return normalized;
}

export async function createHotelMaintenanceTask({
  supabase,
  organizationId,
  propertyId,
  taskType = "REPAIR",
  scheduledAt = null,
  notes = null,
  assignedStaffId = null,
}) {
  if (!supabase) {
    throw new HotelMaintenanceTaskError(
      "Server database connection is required",
      500
    );
  }

  const scopedOrganizationId = requireValue(
    organizationId,
    "organizationId"
  );
  const scopedPropertyId = requireValue(
    propertyId,
    "propertyId"
  );
  const normalizedType = requireValue(
    taskType,
    "taskType"
  ).toUpperCase();

  if (!ALLOWED_MAINTENANCE_TYPES.includes(normalizedType)) {
    throw new HotelMaintenanceTaskError(
      `Unsupported maintenance type: ${normalizedType}`,
      400
    );
  }

  const {
    data: property,
    error: propertyError,
  } = await supabase
    .from("hotel_properties")
    .select("id, organization_id, name")
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedPropertyId)
    .maybeSingle();

  if (propertyError) {
    throw propertyError;
  }

  if (!property) {
    throw new HotelMaintenanceTaskError(
      "Hotel property not found for this organization",
      404
    );
  }

  const now = new Date().toISOString();
  const normalizedScheduledAt = scheduledAt
    ? new Date(scheduledAt).toISOString()
    : now;

  if (Number.isNaN(Date.parse(normalizedScheduledAt))) {
    throw new HotelMaintenanceTaskError(
      "scheduledAt must be a valid date",
      400
    );
  }

  const {
    data: task,
    error: insertError,
  } = await supabase
    .from("hotel_maintenance_tasks")
    .insert({
      organization_id: scopedOrganizationId,
      property_id: scopedPropertyId,
      assigned_staff_id: assignedStaffId || null,
      task_type: normalizedType,
      status: "PENDING",
      scheduled_at: normalizedScheduledAt,
      notes: String(notes || "").trim() || null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  return task;
}

export {
  ALLOWED_MAINTENANCE_TYPES,
  HotelMaintenanceTaskError,
};

export default createHotelMaintenanceTask;
