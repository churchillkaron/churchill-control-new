export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import {
  authorizeOperationsAccess,
  bootstrapOperationsPermissions,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
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

function responseError(error, status = 500) {
  return Response.json({
    success: false,
    error: error?.message || error || "Technician readiness could not be loaded.",
  }, { status: error?.status || status });
}

function isServiceManagedWorkOrder(record = {}) {
  const attributes = record.attributes || {};
  return (
    text(record.source_domain) === "service-management"
      && SERVICE_WORK_SOURCES.has(text(record.source_type))
  ) || Boolean(attributes.service_delivery?.service_plan_id)
    || Boolean(attributes.service_follow_up?.occurrence_id);
}

function workWindow(record = {}) {
  const service = record.attributes?.service_delivery || record.attributes?.service_follow_up || {};
  const start = validDate(
    record.scheduled_start
    || record.window_start
    || service.current_scheduled_start
    || service.window_start
    || service.arrival_window_start
    || service.scheduled_at
  );
  const end = validDate(
    record.scheduled_end
    || record.window_end
    || service.current_scheduled_end
    || service.window_end
    || service.arrival_window_end
  );
  return { start, end, service };
}

function shiftCoverage({ staffId, schedules, scheduledStart, scheduledEnd, timezone }) {
  const staffSchedules = schedules.filter((row) => row.staff_id === staffId);
  const covering = staffSchedules.find((row) => {
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

  if (covering) return { status: "COVERED", covered: true, schedule_id: covering.id, reason: null };
  if (staffSchedules.length) {
    return {
      status: "OUTSIDE_PUBLISHED_SHIFT",
      covered: false,
      schedule_id: null,
      reason: "The visit falls outside this person’s published People shift.",
    };
  }
  return {
    status: "NO_PUBLISHED_SHIFT",
    covered: null,
    schedule_id: null,
    reason: "No published People shift exists for this date.",
  };
}

function readinessRank(value) {
  return ({
    AVAILABLE: 0,
    AVAILABILITY_UNVERIFIED: 1,
    BLOCKED_UNAVAILABLE: 2,
    BLOCKED_OUTSIDE_SHIFT: 3,
  })[value] ?? 9;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = searchParamsToServiceInput(searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const permissions = bootstrapOperationsPermissions({
      permissions: resolved.context.permissions,
      role: resolved.context.role,
    });
    const authorization = authorizeOperationsAccess({
      permissions,
      capabilityId: "work-orders",
      command: "assign",
    });
    if (!authorization.allowed) return responseError("You do not have permission to assign service visits.", 403);

    const organizationId = resolved.context.organization_id;
    const workOrderId = text(input.workOrderId || input.work_order_id);
    if (!workOrderId) return responseError("workOrderId is required.", 400);

    const workOrderResult = await supabaseAdmin
      .from("operations_records")
      .select("id,organization_id,entity_id,capability_id,status,assigned_to,source_domain,source_type,source_id,scheduled_start,scheduled_end,window_start,window_end,attributes")
      .eq("organization_id", organizationId)
      .eq("capability_id", "work-orders")
      .eq("id", workOrderId)
      .maybeSingle();

    if (workOrderResult.error) throw workOrderResult.error;
    const workOrder = workOrderResult.data;
    if (!workOrder) return responseError("Service work order not found.", 404);
    if (!isServiceManagedWorkOrder(workOrder)) return responseError("This work order is not managed by Service Management.", 409);

    const { start: scheduledStart, end: scheduledEnd, service } = workWindow(workOrder);
    if (!scheduledStart || !scheduledEnd || scheduledEnd <= scheduledStart) {
      return responseError("Set a valid service appointment before choosing a technician.", 409);
    }

    const staffResult = await supabaseAdmin
      .from("staff_accounts")
      .select("id,name,role,position,department,party_id")
      .eq("active_organization_id", organizationId)
      .eq("active", true);
    if (staffResult.error) throw staffResult.error;
    const staff = staffResult.data || [];
    const staffIds = staff.map((row) => row.id).filter(Boolean);
    const partyIds = staff.map((row) => row.party_id).filter(Boolean);

    const partiesResult = partyIds.length
      ? await supabaseAdmin
          .from("parties")
          .select("id,display_name")
          .eq("organization_id", organizationId)
          .in("id", partyIds)
      : { data: [], error: null };
    if (partiesResult.error) throw partiesResult.error;
    const partyMap = Object.fromEntries((partiesResult.data || []).map((row) => [row.id, row.display_name]));

    const timeContext = await resolveOrganizationTimeContext({ organizationId });
    const timezone = timeContext.timezone;
    const localStart = localWindowPart(scheduledStart, timezone);
    const localEnd = localWindowPart(scheduledEnd, timezone);

    const availability = staffIds.length
      ? await loadAvailabilityForScheduleRange({
          organizationId,
          staffIds,
          startDate: localStart.date,
          endDate: localEnd.date,
        })
      : { patterns: [], exceptions: [] };

    const schedulesResult = staffIds.length
      ? await supabaseAdmin
          .from("staff_schedules")
          .select("id,staff_id,shift_date,start_time,end_time,status")
          .eq("organization_id", organizationId)
          .eq("status", "PUBLISHED")
          .in("staff_id", staffIds)
          .gte("shift_date", localStart.date)
          .lte("shift_date", localEnd.date)
      : { data: [], error: null };
    if (schedulesResult.error) throw schedulesResult.error;
    const schedules = schedulesResult.data || [];

    const preferredStaffId = text(service.preferred_staff_id);
    const candidates = staff.map((person) => {
      const evaluation = evaluateScheduleAvailability({
        staffId: person.id,
        shiftDate: localStart.date,
        startTime: localStart.time,
        endTime: localEnd.time,
        patterns: availability.patterns,
        exceptions: availability.exceptions,
      });
      const shift = shiftCoverage({
        staffId: person.id,
        schedules,
        scheduledStart,
        scheduledEnd,
        timezone,
      });

      const dispatchReadiness = evaluation.conflict
        ? "BLOCKED_UNAVAILABLE"
        : shift.covered === false
          ? "BLOCKED_OUTSIDE_SHIFT"
          : shift.covered === true
            ? "AVAILABLE"
            : "AVAILABILITY_UNVERIFIED";
      const preferred = Boolean(preferredStaffId && [person.id, person.party_id].filter(Boolean).some((value) => text(value) === preferredStaffId));

      return {
        value: person.party_id || person.id,
        staff_id: person.id,
        party_id: person.party_id || null,
        name: partyMap[person.party_id] || person.name,
        role: person.role || null,
        position: person.position || null,
        department: person.department || null,
        preferred,
        selectable: !dispatchReadiness.startsWith("BLOCKED_"),
        dispatch_readiness: dispatchReadiness,
        workforce_availability: {
          available: !evaluation.conflict,
          status: evaluation.conflict ? "UNAVAILABLE" : "AVAILABLE",
          reason: evaluation.reason || null,
          source_type: evaluation.sourceType || null,
          source_id: evaluation.sourceId || null,
        },
        published_shift: shift,
        qualification: {
          status: "NOT_EVALUATED",
          reason: "No authoritative service qualification requirement is resolved yet.",
        },
      };
    }).sort((a, b) => {
      const readiness = readinessRank(a.dispatch_readiness) - readinessRank(b.dispatch_readiness);
      if (readiness) return readiness;
      const preference = Number(b.preferred) - Number(a.preferred);
      if (preference) return preference;
      return text(a.name).localeCompare(text(b.name));
    });

    return Response.json({
      success: true,
      work_order: {
        id: workOrder.id,
        status: workOrder.status,
        scheduled_start: scheduledStart.toISOString(),
        scheduled_end: scheduledEnd.toISOString(),
        timezone,
        preferred_staff_id: preferredStaffId || null,
      },
      qualification_authority_ready: false,
      qualification_note: "People qualification requirements have not yet been bound to this service, so this response does not claim a qualification pass.",
      candidates,
    });
  } catch (error) {
    return responseError(error);
  }
}
