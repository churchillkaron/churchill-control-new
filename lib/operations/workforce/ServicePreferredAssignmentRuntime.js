import { getEmployeeOperationalEligibility } from "@/lib/people/employees/employeeOperationalEligibilityService";
import {
  evaluateScheduleAvailability,
  loadAvailabilityForScheduleRange,
} from "@/lib/people/workforce/workforceAvailabilityRuntime";
import {
  loadQualificationEvidence,
  requiredQualificationCodesFromService,
} from "@/lib/people/workforce/qualificationRuntime";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  partsInTimezone,
  resolveOrganizationTimeContext,
  scheduleWindow,
} from "@/lib/shared/time/organizationTime";

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
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

function serviceContext(workOrder = {}) {
  return workOrder.attributes?.service_delivery || workOrder.attributes?.service_follow_up || {};
}

async function preferredAssignmentReadiness({ organizationId, staffId, workOrder }) {
  const service = serviceContext(workOrder);
  const scheduledStart = validDate(
    workOrder.scheduled_start
    || workOrder.window_start
    || service.current_scheduled_start
    || service.window_start
    || service.arrival_window_start
    || service.scheduled_at,
  );
  const scheduledEnd = validDate(
    workOrder.scheduled_end
    || workOrder.window_end
    || service.current_scheduled_end
    || service.window_end
    || service.arrival_window_end,
  );

  if (!scheduledStart || !scheduledEnd || scheduledEnd <= scheduledStart) {
    return { ready: false, reason: "service-appointment-required" };
  }

  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const timezone = timeContext.timezone;
  const localStart = localWindowPart(scheduledStart, timezone);
  const localEnd = localWindowPart(scheduledEnd, timezone);

  const requiredQualificationCodes = requiredQualificationCodesFromService(service);
  const qualificationEvidence = await loadQualificationEvidence({
    organizationId,
    staffIds: [staffId],
    requiredCodes: requiredQualificationCodes,
    onDate: localStart.date,
  });
  const qualification = qualificationEvidence.evaluations[staffId];

  if (qualification?.status === "REQUIREMENT_NOT_CONFIGURED") {
    return {
      ready: false,
      reason: "qualification-requirement-not-configured",
      missing_qualification_codes: qualification.unknown_requirement_codes || [],
    };
  }
  if (qualification?.qualified === false) {
    return {
      ready: false,
      reason: "preferred-technician-unqualified",
      missing_qualification_codes: qualification.missing_codes || [],
    };
  }

  const availability = await loadAvailabilityForScheduleRange({
    organizationId,
    staffIds: [staffId],
    startDate: localStart.date,
    endDate: localEnd.date,
  });
  const evaluation = evaluateScheduleAvailability({
    staffId,
    shiftDate: localStart.date,
    startTime: localStart.time,
    endTime: localEnd.time,
    patterns: availability.patterns,
    exceptions: availability.exceptions,
  });
  if (evaluation.conflict) {
    return {
      ready: false,
      reason: "preferred-technician-unavailable",
      availability_reason: evaluation.reason || null,
    };
  }

  const schedulesResult = await supabaseAdmin
    .from("staff_schedules")
    .select("id,staff_id,shift_date,start_time,end_time,status")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
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
    return { ready: false, reason: "preferred-technician-outside-published-shift" };
  }

  return {
    ready: true,
    scheduled_start: scheduledStart.toISOString(),
    scheduled_end: scheduledEnd.toISOString(),
    timezone,
    qualification_status: qualification?.status || "NOT_REQUIRED",
    required_qualification_codes: requiredQualificationCodes,
    qualification_evidence: qualification?.evidence || [],
    availability_source: evaluation.sourceType || null,
    availability_source_id: evaluation.sourceId || null,
    published_shift_id: coveringShift?.id || null,
    readiness: coveringShift
      ? "AVAILABLE_ON_PUBLISHED_SHIFT"
      : evaluation.sourceType
        ? "AVAILABLE_BY_PEOPLE_RULE"
        : "NO_CONFLICT_SHIFT_UNVERIFIED",
  };
}

export async function assignPreferredServiceTechnician({
  context,
  workOrder,
  preferredStaffId,
  occurrenceId,
}) {
  const staffId = cleanText(preferredStaffId);
  if (!staffId || !workOrder?.id) {
    return Object.freeze({
      assigned: false,
      reason: staffId ? "work-order-required" : "no-preferred-technician",
      record: workOrder || null,
    });
  }

  if (cleanText(workOrder.assigned_to) === staffId) {
    return Object.freeze({ assigned: true, reason: "already-assigned", record: workOrder });
  }

  const eligibility = await getEmployeeOperationalEligibility({
    organizationId: context?.organization_id,
    staffId,
    entityId: context?.entity_id || workOrder.entity_id || null,
    at: workOrder.scheduled_start || new Date(),
  });
  if (!eligibility.eligible) {
    return Object.freeze({
      assigned: false,
      reason: eligibility.reason,
      record: workOrder,
      employee: eligibility.employee,
    });
  }

  const readiness = await preferredAssignmentReadiness({
    organizationId: context?.organization_id,
    staffId,
    workOrder,
  });
  if (!readiness.ready) {
    return Object.freeze({
      assigned: false,
      ...readiness,
      record: workOrder,
      employee: eligibility.employee,
    });
  }

  const response = await serverOperationsApi.execute({
    capabilityId: "work-orders",
    command: "assign",
    context,
    payload: {
      id: workOrder.id,
      assigned_to: staffId,
      source_domain: "service-management",
      source_type: "service-plan-occurrence-assignment",
      source_id: occurrenceId || workOrder.source_id || workOrder.id,
      idempotency_key: `service-preferred-assignment:${occurrenceId || workOrder.id}:${staffId}`,
      attributes: {
        ...(workOrder.attributes || {}),
        service_assignment: {
          preferred_staff_id: staffId,
          preferred_staff_name: eligibility.employee?.name || null,
          employment_id: eligibility.employment?.id || null,
          entity_id: eligibility.employment?.entity_id || null,
          assigned_at: new Date().toISOString(),
        },
        assignment_workforce_evidence: {
          checked_at: new Date().toISOString(),
          staff_id: staffId,
          scheduled_start: readiness.scheduled_start,
          scheduled_end: readiness.scheduled_end,
          timezone: readiness.timezone,
          readiness: readiness.readiness,
          availability_source: readiness.availability_source,
          availability_source_id: readiness.availability_source_id,
          published_shift_id: readiness.published_shift_id,
          qualification_status: readiness.qualification_status,
          required_qualification_codes: readiness.required_qualification_codes,
          qualification_evidence: readiness.qualification_evidence,
        },
      },
    },
  });

  if (response.status >= 400 || !response.body?.ok) {
    return Object.freeze({
      assigned: false,
      reason: response.body?.error || "operations-assignment-failed",
      record: workOrder,
      employee: eligibility.employee,
    });
  }

  return Object.freeze({
    assigned: true,
    reason: response.body.execution?.idempotent_replay ? "idempotent-replay" : "assigned",
    record: response.body.execution?.result || workOrder,
    employee: eligibility.employee,
  });
}

export default assignPreferredServiceTechnician;
