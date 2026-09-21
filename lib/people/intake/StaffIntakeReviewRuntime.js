import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { allowedStaffIntakeDestinations as allowedDestinationsByPolicy } from "@/lib/people/intake/StaffIntakeDestinationPolicy";

function text(value, limit = 160) {
  return String(value ?? "").trim().slice(0, limit);
}

export function allowedStaffIntakeDestinations(context = {}) {
  return allowedDestinationsByPolicy({
    role: context?.role || context?.staff?.role || null,
    department: context?.staff?.department || null,
    permissions: context?.permissions || [],
  });
}

function projectUniversalDestination(value) {
  const destination = value?.destination || null;
  if (!destination) return null;
  const label = text(
    destination.label || destination.workspace_name || destination.domain,
    160,
  ) || "Resolved destination";
  return {
    destination: {
      label,
      route: text(destination.route, 240) || null,
    },
  };
}

function projectBusinessMatch(value) {
  if (!value || !value.status) return null;
  const first = Array.isArray(value.candidates) ? value.candidates[0] : null;
  return {
    status: text(value.status, 80).toUpperCase(),
    candidates: first
      ? [{
          record_type: text(first.record_type, 80) || null,
          label: text(first.label, 180) || null,
        }]
      : [],
  };
}

function projectStaffIntakeAssignment(row = {}) {
  return {
    id: row.id || null,
    destination_key: text(row.destination_key, 80) || "UNKNOWN",
    workflow: text(row.workflow, 120) || "GENERAL_DOCUMENT",
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
    urgency: text(row.urgency, 40).toUpperCase() === "URGENT" ? "URGENT" : "NORMAL",
    suggested_action: text(row.suggested_action, 240) || "Review and route this upload.",
    rationale: text(row.rationale, 500) || null,
    handoff_status: text(row.handoff_status, 80) || null,
    status: text(row.status, 80) || null,
    universal_destination: projectUniversalDestination(row.universal_destination),
    business_match: projectBusinessMatch(row.business_match),
  };
}

export async function listStaffIntakeAssignments({ context, limit = 100 } = {}) {
  if (!context?.organizationId || !context?.staff?.id) throw new Error("Authenticated staff context required");
  const allowed = allowedStaffIntakeDestinations(context);
  if (!allowed.length) return [];

  let query = supabaseAdmin
    .from("staff_intake_assignments")
    .select("id,organization_id,entity_id,enterprise_document_id,uploader_staff_id,destination_key,destination_domain,reviewer_role,workflow,confidence,urgency,requires_human_review,suggested_action,rationale,universal_destination,business_match,handoff_status,status,assigned_staff_id,reviewed_by_staff_id,reviewed_at,resolution_note,created_at,updated_at")
    .eq("organization_id", context.organizationId)
    .in("status", ["PENDING_REVIEW", "ASSIGNED", "ROUTING_APPROVED"])
    .order("urgency", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 250)));

  if (!allowed.includes("*")) query = query.in("destination_key", allowed);
  const result = await query;
  if (result.error) throw result.error;
  return (result.data || []).map(projectStaffIntakeAssignment);
}

export async function getStaffIntakeAssignmentForReview({ context, assignmentId } = {}) {
  if (!context?.organizationId || !context?.staff?.id) throw new Error("Authenticated staff context required");
  const allowed = allowedStaffIntakeDestinations(context);
  const found = await supabaseAdmin
    .from("staff_intake_assignments")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", assignmentId)
    .maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) {
    const error = new Error("Intake assignment not found");
    error.status = 404;
    throw error;
  }
  if (!allowed.includes("*") && !allowed.includes(found.data.destination_key)) {
    const error = new Error("You are not authorized to review this intake destination");
    error.status = 403;
    error.code = "STAFF_INTAKE_REVIEW_FORBIDDEN";
    throw error;
  }
  return found.data;
}

export async function updateStaffIntakeAssignment({ context, assignmentId, action, note = null } = {}) {
  if (!context?.organizationId || !context?.staff?.id) throw new Error("Authenticated staff context required");
  const normalizedAction = text(action, 40).toUpperCase();
  if (!["APPROVE_ROUTING", "REJECT", "COMPLETE", "ASSIGN_SELF"].includes(normalizedAction)) {
    const error = new Error("Unsupported intake review action");
    error.status = 400;
    throw error;
  }

  const found = await getStaffIntakeAssignmentForReview({ context, assignmentId });
  const currentStatus = text(found.status, 40).toUpperCase();
  const allowedCurrentStatuses = normalizedAction === "COMPLETE"
    ? new Set(["ROUTING_APPROVED"])
    : normalizedAction === "ASSIGN_SELF"
      ? new Set(["PENDING_REVIEW", "ASSIGNED"])
      : new Set(["PENDING_REVIEW", "ASSIGNED"]);

  if (!allowedCurrentStatuses.has(currentStatus)) {
    const error = new Error(`Intake action ${normalizedAction} is not valid from ${currentStatus || "UNKNOWN"}`);
    error.status = 409;
    error.code = "STAFF_INTAKE_STATE_CONFLICT";
    throw error;
  }

  if (
    normalizedAction === "ASSIGN_SELF" &&
    currentStatus === "ASSIGNED" &&
    found.assigned_staff_id &&
    found.assigned_staff_id !== context.staff.id
  ) {
    const error = new Error("Intake is already assigned to another reviewer");
    error.status = 409;
    error.code = "STAFF_INTAKE_ASSIGNMENT_CONFLICT";
    throw error;
  }

  const now = new Date().toISOString();
  const patch = { updated_at: now };
  if (normalizedAction === "ASSIGN_SELF") {
    patch.status = "ASSIGNED";
    patch.assigned_staff_id = context.staff.id;
  } else if (normalizedAction === "APPROVE_ROUTING") {
    patch.status = "ROUTING_APPROVED";
    patch.handoff_status = "READY_FOR_DESTINATION_REVIEW";
    patch.reviewed_by_staff_id = context.staff.id;
    patch.reviewed_at = now;
    patch.resolution_note = text(note, 1000) || null;
  } else if (normalizedAction === "REJECT") {
    patch.status = "REJECTED";
    patch.handoff_status = "REJECTED";
    patch.reviewed_by_staff_id = context.staff.id;
    patch.reviewed_at = now;
    patch.resolution_note = text(note, 1000) || null;
  } else if (normalizedAction === "COMPLETE") {
    patch.status = "COMPLETED";
    patch.handoff_status = "COMPLETED";
    patch.reviewed_by_staff_id = context.staff.id;
    patch.reviewed_at = now;
    patch.resolution_note = text(note, 1000) || null;
  }

  const updated = await supabaseAdmin
    .from("staff_intake_assignments")
    .update(patch)
    .eq("organization_id", context.organizationId)
    .eq("id", assignmentId)
    .eq("status", found.status)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) {
    const error = new Error("Intake changed while you were reviewing it. Refresh before taking another action.");
    error.status = 409;
    error.code = "STAFF_INTAKE_STATE_CONFLICT";
    throw error;
  }
  return projectStaffIntakeAssignment(updated.data);
}
