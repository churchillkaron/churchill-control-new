export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { serverOperationsEvents } from "@/lib/operations/events/serverOperationsEvents";
import {
  resolveOperationsRequestContext,
} from "@/lib/operations/api/resolveOperationsRequestContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  partsInTimezone,
  resolveOrganizationTimeContext,
  scheduleWindow,
} from "@/lib/shared/time/organizationTime";
import {
  evaluateScheduleAvailability,
  loadAvailabilityForScheduleRange,
} from "@/lib/people/workforce/workforceAvailabilityRuntime";

const SERVICE_EXECUTION_COMMANDS = new Set(["start", "complete"]);
const SERVICE_WORK_SOURCES = new Set([
  "service-plan-occurrence",
  "service-follow-up-work-request",
]);

function text(value) {
  return String(value ?? "").trim();
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function localWindowPart(date, timezone) {
  const parts = partsInTimezone(date, timezone);
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

function isServiceManagedWorkOrder(record = {}) {
  const sourceDomain = text(record.source_domain);
  const sourceType = text(record.source_type);
  const attributes = record.attributes || {};
  return (
    (sourceDomain === "service-management" && SERVICE_WORK_SOURCES.has(sourceType))
    || Boolean(attributes.service_delivery?.service_plan_id)
    || Boolean(attributes.service_follow_up?.occurrence_id)
  );
}

async function loadWorkOrder({ capabilityId, body, context }) {
  if (capabilityId !== "work-orders") return null;
  const recordId = text(body.id || body.record_id || body.recordId);
  if (!recordId) return null;

  const detail = await serverOperationsApi.detail({
    capabilityId: "work-orders",
    id: recordId,
    context,
  });

  if (detail.status >= 400 || !detail.body?.ok || !detail.body?.record) return null;
  return detail.body.record;
}

async function guardServiceExecutionCommand({ capabilityId, command, body, context }) {
  if (capabilityId !== "work-orders" || !SERVICE_EXECUTION_COMMANDS.has(command)) return null;
  const record = await loadWorkOrder({ capabilityId, body, context });
  if (!record || !isServiceManagedWorkOrder(record)) return null;

  return NextResponse.json(
    {
      ok: false,
      code: "SERVICE_VISIT_REQUIRES_TECHNICIAN_WORKFLOW",
      error: command === "start"
        ? "Start this service visit from the technician workspace so arrival is bound to the exact occurrence."
        : "Complete this service visit from the technician workspace so protocol, treatment, monitoring, evidence and exception gates are validated.",
      technician_required: true,
      occurrence_id:
        record.attributes?.service_delivery?.occurrence_id
        || record.attributes?.service_follow_up?.corrective_occurrence_id
        || record.source_id
        || null,
      work_order_id: record.id,
    },
    { status: 409 },
  );
}

async function resolveActiveAssignedStaff({ organizationId, body }) {
  const suppliedStaffId = text(body.attributes?.assignee_staff_id);
  const assignedTo = text(body.assigned_to);
  if (!assignedTo) return null;

  let query = supabaseAdmin
    .from("staff_accounts")
    .select("id,party_id,name,role,position,department")
    .eq("active_organization_id", organizationId)
    .eq("active", true);

  if (suppliedStaffId) {
    query = query.eq("id", suppliedStaffId);
  } else {
    query = query.eq("party_id", assignedTo);
  }

  let { data, error } = await query.maybeSingle();
  if (error) throw error;

  if (!data && !suppliedStaffId) {
    const fallback = await supabaseAdmin
      .from("staff_accounts")
      .select("id,party_id,name,role,position,department")
      .eq("active_organization_id", organizationId)
      .eq("active", true)
      .eq("id", assignedTo)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }

  if (!data) return null;
  if (![data.id, data.party_id].filter(Boolean).some((value) => text(value) === assignedTo)) return null;
  return data;
}

async function guardServiceAssignmentCommand({ capabilityId, command, body, context }) {
  if (capabilityId !== "work-orders" || command !== "assign") return null;

  const record = await loadWorkOrder({ capabilityId, body, context });
  if (!record || !isServiceManagedWorkOrder(record)) return null;

  const organizationId = context.organization_id;
  const staff = await resolveActiveAssignedStaff({ organizationId, body });
  if (!staff) {
    return NextResponse.json({
      ok: false,
      code: "SERVICE_ASSIGNMENT_PERSON_NOT_ACTIVE",
      error: "Choose an active person from People before assigning this service visit.",
      work_order_id: record.id,
    }, { status: 409 });
  }

  const service = record.attributes?.service_delivery || record.attributes?.service_follow_up || {};
  const scheduledStart = validDate(
    record.scheduled_start
    || record.window_start
    || service.current_scheduled_start
    || service.window_start
    || service.arrival_window_start
    || service.scheduled_at
  );
  const scheduledEnd = validDate(
    record.scheduled_end
    || record.window_end
    || service.current_scheduled_end
    || service.window_end
    || service.arrival_window_end
  );

  if (!scheduledStart || !scheduledEnd || scheduledEnd <= scheduledStart) {
    return NextResponse.json({
      ok: false,
      code: "SERVICE_ASSIGNMENT_WINDOW_REQUIRED",
      error: "Set a valid service appointment before assigning a technician so People availability can be checked.",
      work_order_id: record.id,
    }, { status: 409 });
  }

  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const timezone = timeContext.timezone;
  const localStart = localWindowPart(scheduledStart, timezone);
  const localEnd = localWindowPart(scheduledEnd, timezone);

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
    return NextResponse.json({
      ok: false,
      code: "SERVICE_ASSIGNMENT_PERSON_UNAVAILABLE",
      error: evaluation.reason || "This person is unavailable for the service appointment.",
      work_order_id: record.id,
      staff_id: staff.id,
      availability_source: evaluation.sourceType || null,
    }, { status: 409 });
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
      && window.start.getTime() <= scheduledStart.getTime()
      && window.end.getTime() >= scheduledEnd.getTime();
  });

  if (schedules.length && !coveringShift) {
    return NextResponse.json({
      ok: false,
      code: "SERVICE_ASSIGNMENT_OUTSIDE_PUBLISHED_SHIFT",
      error: "This service appointment falls outside the person’s published People shift.",
      work_order_id: record.id,
      staff_id: staff.id,
    }, { status: 409 });
  }

  const readiness = coveringShift
    ? "AVAILABLE_ON_PUBLISHED_SHIFT"
    : evaluation.sourceType
      ? "AVAILABLE_BY_PEOPLE_RULE"
      : "NO_CONFLICT_SHIFT_UNVERIFIED";

  body.attributes = {
    ...(body.attributes || {}),
    assignee_staff_id: staff.id,
    assignee_party_id: staff.party_id || null,
    assignment_workforce_evidence: {
      checked_at: new Date().toISOString(),
      staff_id: staff.id,
      party_id: staff.party_id || null,
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      timezone,
      readiness,
      availability_source: evaluation.sourceType || null,
      availability_source_id: evaluation.sourceId || null,
      published_shift_id: coveringShift?.id || null,
    },
  };

  return null;
}

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const command = String(resolvedParams?.command || "").trim();
  const body = await request.json();
  const resolved = await resolveOperationsRequestContext({
    request,
    input: body,
    capabilityId,
    command,
  });

  if (!resolved.success) {
    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        required_permissions: resolved.required_permissions || [],
      },
      { status: resolved.status || 400 },
    );
  }

  const serviceGuard = await guardServiceExecutionCommand({
    capabilityId,
    command,
    body,
    context: resolved.context,
  });
  if (serviceGuard) return serviceGuard;

  const assignmentGuard = await guardServiceAssignmentCommand({
    capabilityId,
    command,
    body,
    context: resolved.context,
  });
  if (assignmentGuard) return assignmentGuard;

  const result = await serverOperationsApi.execute({
    capabilityId,
    command,
    context: resolved.context,
    payload: {
      ...body,
      updated_by: resolved.user?.id || null,
      actor_id: resolved.user?.id || null,
    },
  });

  let eventDelivery = null;

  if (result.status >= 200 && result.status < 300 && result.body?.ok) {
    try {
      eventDelivery = await serverOperationsEvents.publishPending({
        organizationId: resolved.context.organization_id,
        limit: 50,
      });
    } catch (error) {
      eventDelivery = {
        ok: false,
        deferred: true,
        error: error.message || "Operations event delivery deferred.",
      };
    }
  }

  return NextResponse.json(
    {
      ...result.body,
      event_delivery: eventDelivery,
    },
    { status: result.status },
  );
}