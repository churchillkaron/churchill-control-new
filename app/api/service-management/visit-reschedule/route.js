export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import {
  authorizeOperationsAccess,
  bootstrapOperationsPermissions,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import {
  evaluateScheduleAvailability,
  loadAvailabilityForScheduleRange,
} from "@/lib/people/workforce/workforceAvailabilityRuntime";
import {
  loadQualificationEvidence,
  requiredQualificationCodesFromService,
} from "@/lib/people/workforce/qualificationRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  partsInTimezone,
  resolveOrganizationTimeContext,
  scheduleWindow,
} from "@/lib/shared/time/organizationTime";

function text(value) {
  return String(value ?? "").trim();
}

function isoDate(value, label) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${label} is required.`);
    error.status = 400;
    throw error;
  }
  return parsed.toISOString();
}

function localWindowPart(date, timezone) {
  const parts = partsInTimezone(date, timezone);
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

function responseError(error, status = 500, extra = {}) {
  return Response.json({
    success: false,
    error: error?.message || error || "Service visit could not be rescheduled.",
    ...extra,
  }, { status: error?.status || status });
}

async function resolveOccurrence({ organizationId, occurrenceId, workOrderId }) {
  let query = supabaseAdmin
    .from("service_plan_occurrences")
    .select("id,work_order_id")
    .eq("organization_id", organizationId);

  if (occurrenceId) query = query.eq("id", occurrenceId);
  else if (workOrderId) query = query.eq("work_order_id", workOrderId);
  else return null;

  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadServiceWorkOrder({ organizationId, workOrderId }) {
  if (!workOrderId) return null;
  const result = await supabaseAdmin
    .from("operations_records")
    .select("id,status,assigned_to,scheduled_start,scheduled_end,source_domain,source_type,attributes")
    .eq("organization_id", organizationId)
    .eq("capability_id", "work-orders")
    .eq("id", workOrderId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function resolveAssignedStaff({ organizationId, assignedTo }) {
  const identity = text(assignedTo);
  if (!identity) return null;

  const byParty = await supabaseAdmin
    .from("staff_accounts")
    .select("id,party_id,name,role,position,department")
    .eq("active_organization_id", organizationId)
    .eq("active", true)
    .eq("party_id", identity)
    .maybeSingle();
  if (byParty.error) throw byParty.error;
  if (byParty.data) return byParty.data;

  const byStaff = await supabaseAdmin
    .from("staff_accounts")
    .select("id,party_id,name,role,position,department")
    .eq("active_organization_id", organizationId)
    .eq("active", true)
    .eq("id", identity)
    .maybeSingle();
  if (byStaff.error) throw byStaff.error;
  return byStaff.data || null;
}

async function validateAssignedTechnicianForNewWindow({
  organizationId,
  workOrder,
  scheduledStart,
  scheduledEnd,
}) {
  if (!workOrder?.assigned_to) return { checked: false, reason: "unassigned" };

  const staff = await resolveAssignedStaff({ organizationId, assignedTo: workOrder.assigned_to });
  if (!staff) {
    return {
      blocked: true,
      code: "SERVICE_RESCHEDULE_ASSIGNEE_NOT_ACTIVE",
      error: "The currently assigned technician is no longer active in People. Reassign the visit before moving it.",
    };
  }

  const start = new Date(scheduledStart);
  const end = new Date(scheduledEnd);
  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const timezone = timeContext.timezone;
  const localStart = localWindowPart(start, timezone);
  const localEnd = localWindowPart(end, timezone);
  const service = workOrder.attributes?.service_delivery || workOrder.attributes?.service_follow_up || {};

  const requiredQualificationCodes = requiredQualificationCodesFromService(service);
  const qualificationEvidence = await loadQualificationEvidence({
    organizationId,
    staffIds: [staff.id],
    requiredCodes: requiredQualificationCodes,
    onDate: localStart.date,
  });
  const qualification = qualificationEvidence.evaluations[staff.id];

  if (qualification?.status === "REQUIREMENT_NOT_CONFIGURED") {
    return {
      blocked: true,
      code: "SERVICE_RESCHEDULE_QUALIFICATION_CONFIG_REQUIRED",
      error: `Configure the required People qualification before rescheduling: ${(qualification.unknown_requirement_codes || []).join(", ")}.`,
    };
  }
  if (qualification?.qualified === false) {
    return {
      blocked: true,
      code: "SERVICE_RESCHEDULE_ASSIGNEE_UNQUALIFIED",
      error: `The assigned technician is missing required qualification${qualification.missing_codes?.length === 1 ? "" : "s"}: ${(qualification.missing_codes || []).join(", ")}. Reassign before moving the visit.`,
    };
  }

  const availability = await loadAvailabilityForScheduleRange({
    organizationId,
    staffIds: [staff.id],
    startDate: localStart.date,
    endDate: localEnd.date,
  });
  const evaluation = evaluateScheduleAvailability({
    staffId: staff.id,
    shiftDate: localStart.date,
    startTime: localStart.time,
    endTime: localEnd.time,
    patterns: availability.patterns,
    exceptions: availability.exceptions,
  });
  if (evaluation.conflict) {
    return {
      blocked: true,
      code: "SERVICE_RESCHEDULE_ASSIGNEE_UNAVAILABLE",
      error: evaluation.reason || "The assigned technician is unavailable for the proposed time.",
    };
  }

  const schedulesResult = await supabaseAdmin
    .from("staff_schedules")
    .select("id,staff_id,shift_date,start_time,end_time,status")
    .eq("organization_id", organizationId)
    .eq("staff_id", staff.id)
    .eq("status", "PUBLISHED")
    .gte("shift_date", localStart.date)
    .lte("shift_date", localEnd.date);
  if (schedulesResult.error) throw schedulesResult.error;

  const schedules = schedulesResult.data || [];
  const coveringShift = schedules.find((row) => {
    const window = scheduleWindow({
      shiftDate: row.shift_date,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone,
    });
    return window?.start && window?.end
      && window.start.getTime() <= start.getTime()
      && window.end.getTime() >= end.getTime();
  });
  if (schedules.length && !coveringShift) {
    return {
      blocked: true,
      code: "SERVICE_RESCHEDULE_OUTSIDE_PUBLISHED_SHIFT",
      error: "The proposed visit time is outside the assigned technician’s published People shift.",
    };
  }

  const assigneeIds = [staff.id, staff.party_id].filter(Boolean);
  const collisionsResult = await supabaseAdmin
    .from("operations_records")
    .select("id,name,scheduled_start,scheduled_end,status")
    .eq("organization_id", organizationId)
    .eq("capability_id", "work-orders")
    .neq("id", workOrder.id)
    .in("assigned_to", assigneeIds)
    .in("status", ["assigned", "released", "in_progress", "paused"])
    .lt("scheduled_start", scheduledEnd)
    .gt("scheduled_end", scheduledStart)
    .limit(5);
  if (collisionsResult.error) throw collisionsResult.error;
  const collisions = collisionsResult.data || [];
  if (collisions.length) {
    return {
      blocked: true,
      code: "SERVICE_RESCHEDULE_TECHNICIAN_COLLISION",
      error: "The assigned technician already has overlapping active work at the proposed time. Choose another time or reassign the visit.",
      collisions: collisions.map((row) => ({
        work_order_id: row.id,
        name: row.name || "Other work",
        scheduled_start: row.scheduled_start,
        scheduled_end: row.scheduled_end,
        status: row.status,
      })),
    };
  }

  return {
    checked: true,
    blocked: false,
    staff_id: staff.id,
    party_id: staff.party_id || null,
    qualification_status: qualification?.status || "NOT_REQUIRED",
    published_shift_id: coveringShift?.id || null,
    availability_source: evaluation.sourceType || null,
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const permissions = bootstrapOperationsPermissions({
      permissions: resolved.context.permissions,
      role: resolved.context.role,
    });
    const authorization = authorizeOperationsAccess({
      permissions,
      capabilityId: "work-orders",
      command: "reschedule",
    });
    if (!authorization.allowed) {
      return responseError("You do not have permission to reschedule service visits.", 403);
    }

    const organizationId = resolved.context.organization_id;
    const requestedWorkOrderId = text(body.workOrderId || body.work_order_id);
    const requestedOccurrenceId = text(body.occurrenceId || body.occurrence_id);
    const occurrence = await resolveOccurrence({
      organizationId,
      occurrenceId: requestedOccurrenceId,
      workOrderId: requestedWorkOrderId,
    });
    const occurrenceId = occurrence?.id || null;
    const workOrderId = requestedWorkOrderId || occurrence?.work_order_id || null;
    const reason = text(body.reason);
    const idempotencyKey = text(
      request.headers.get("Idempotency-Key")
      || body.idempotencyKey
      || body.idempotency_key,
    );

    if (!occurrenceId || !workOrderId) return responseError("The exact service visit could not be resolved for this work order.", 409);
    if (!reason) return responseError("Tell us why the visit is moving.", 400);
    if (!idempotencyKey) return responseError("A request identity is required.", 400);

    const scheduledStart = isoDate(body.scheduledStart || body.scheduled_start, "New arrival time");
    const scheduledEnd = isoDate(body.scheduledEnd || body.scheduled_end, "New end time");
    if (new Date(scheduledEnd).getTime() <= new Date(scheduledStart).getTime()) {
      return responseError("The visit end must be after the arrival time.", 400);
    }

    const workOrder = await loadServiceWorkOrder({ organizationId, workOrderId });
    if (!workOrder) return responseError("The service work order could not be found.", 404);
    if (workOrder.source_domain !== "service-management") return responseError("This work order is not governed by Service Management.", 409);

    const technicianReadiness = await validateAssignedTechnicianForNewWindow({
      organizationId,
      workOrder,
      scheduledStart,
      scheduledEnd,
    });
    if (technicianReadiness.blocked) {
      return responseError(technicianReadiness.error, 409, {
        code: technicianReadiness.code,
        collisions: technicianReadiness.collisions || [],
      });
    }

    const { data, error } = await supabaseAdmin.rpc("reschedule_service_visit_atomic", {
      p_organization_id: organizationId,
      p_occurrence_id: occurrenceId,
      p_scheduled_start: scheduledStart,
      p_scheduled_end: scheduledEnd,
      p_reason: reason,
      p_actor_id: resolved.context.actor_id || null,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const rpcError = new Error(error.message || "Service visit could not be rescheduled.");
      rpcError.status = /cannot be rescheduled|only generated|not found|lineage|scope|unsupported/i.test(rpcError.message) ? 409 : 500;
      throw rpcError;
    }

    return Response.json({
      success: true,
      idempotent_replay: Boolean(data?.idempotent_replay),
      technician_readiness: technicianReadiness,
      visit: {
        occurrence_id: data?.result?.occurrence?.id || occurrenceId,
        work_order_id: data?.result?.work_order?.id || workOrderId,
        scheduled_start: data?.result?.work_order?.scheduled_start || scheduledStart,
        scheduled_end: data?.result?.work_order?.scheduled_end || scheduledEnd,
        reason: data?.result?.change?.reason || reason,
        rescheduled_at: data?.result?.change?.rescheduled_at || null,
      },
    });
  } catch (error) {
    return responseError(error);
  }
}
