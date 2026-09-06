import {
  loadQualificationEvidence,
  requiredQualificationCodesFromService,
} from "@/lib/people/workforce/qualificationRuntime";
import {
  partsInTimezone,
  resolveOrganizationTimeContext,
} from "@/lib/shared/time/organizationTime";

function text(value) {
  return String(value ?? "").trim();
}

function localDate(now, timezone) {
  const parts = partsInTimezone(now, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function executionActor(resolved = {}) {
  const staff = resolved.access?.staff || resolved.staff || null;
  return {
    staff_id: staff?.id || null,
    party_id: resolved.currentPartyId || staff?.party_id || null,
    name: staff?.name || staff?.email || null,
  };
}

function assignedToActor(workOrder = {}, actor = {}) {
  const assigned = text(workOrder.assigned_to);
  if (!assigned) return false;
  return [actor.party_id, actor.staff_id]
    .filter(Boolean)
    .some((value) => text(value) === assigned);
}

function blockedError(message, details = {}) {
  const error = new Error(message);
  error.status = 409;
  error.technician_eligibility = details;
  return error;
}

export async function assertServiceTechnicianEligibility({
  resolved,
  workOrder,
  service = {},
  action = "execute",
  now = new Date(),
}) {
  const organizationId = resolved?.context?.organization_id;
  const actor = executionActor(resolved);

  if (!organizationId || !actor.staff_id) {
    throw blockedError("A current People staff identity is required to execute this service visit.", {
      status: "BLOCKED_STAFF_IDENTITY",
      action,
    });
  }

  if (!assignedToActor(workOrder, actor)) {
    throw blockedError("Only the technician currently assigned to this visit can execute it.", {
      status: "BLOCKED_NOT_ASSIGNED_TECHNICIAN",
      action,
      assigned_to: workOrder?.assigned_to || null,
      actor_staff_id: actor.staff_id,
      actor_party_id: actor.party_id,
    });
  }

  const requiredCodes = requiredQualificationCodesFromService(service);
  if (!requiredCodes.length) {
    return Object.freeze({
      ready: true,
      status: "NOT_REQUIRED",
      action,
      actor,
      required_qualification_codes: [],
      qualification: null,
    });
  }

  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const onDate = localDate(now, timeContext.timezone);
  const evidence = await loadQualificationEvidence({
    organizationId,
    staffIds: [actor.staff_id],
    requiredCodes,
    onDate,
  });

  if (!evidence.authoritative) {
    throw blockedError(
      "People qualification authority is unavailable or the treatment protocol requires an unknown qualification. Execution is blocked rather than guessing eligibility.",
      {
        status: "BLOCKED_QUALIFICATION_CONFIG",
        action,
        on_date: onDate,
        timezone: timeContext.timezone,
        required_qualification_codes: requiredCodes,
        authority_reason: evidence.reason || null,
      },
    );
  }

  const evaluation = evidence.evaluations?.[actor.staff_id] || null;
  if (!evaluation?.qualified) {
    const missing = evaluation?.missing_codes || requiredCodes;
    throw blockedError(
      `Your current People qualification evidence does not allow this visit to ${action}. Missing or expired: ${missing.join(", ")}.`,
      {
        status: "BLOCKED_UNQUALIFIED",
        action,
        on_date: onDate,
        timezone: timeContext.timezone,
        required_qualification_codes: requiredCodes,
        qualification: evaluation,
      },
    );
  }

  return Object.freeze({
    ready: true,
    status: "QUALIFIED",
    action,
    actor,
    on_date: onDate,
    timezone: timeContext.timezone,
    required_qualification_codes: requiredCodes,
    qualification: evaluation,
  });
}

export default Object.freeze({
  assertServiceTechnicianEligibility,
});
