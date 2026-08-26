import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import { createSecretaryCalendarEventAtomic } from "@/lib/operator/secretary/SecretaryAtomicBookingRuntime";

const EXACT_ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function upper(value, limit = 80) {
  return text(value, limit).toUpperCase();
}

function exactTimestamp(value) {
  const clean = text(value, 120);
  if (!EXACT_ISO_WITH_ZONE.test(clean)) return null;
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function jobTimezone(job = {}) {
  return text(object(job.metadata).timezone, 120) || "UTC";
}

function resolverSystem() {
  return [
    "You are structuring one Avantiqo Secretary calendar action.",
    "You do not redesign Intelligence and you do not decide anything outside the supplied Secretary objective and instruction.",
    "Use only the supplied objective, instruction, current timestamp, timezone and governed contact context.",
    "Never guess a missing date, time, duration or timezone. If any required scheduling detail is ambiguous, return REVIEW_REQUIRED.",
    "For RESOLVED, starts_at and ends_at must be exact ISO 8601 timestamps including Z or a numeric UTC offset, and ends_at must be after starts_at.",
    "Do not invent contact IDs, owner IDs, external addresses, approvals or commitments.",
    "Return exactly one JSON object: {\"status\":\"RESOLVED|REVIEW_REQUIRED\",\"reason\":\"...\",\"event\":{\"title\":\"...\",\"description\":\"...\",\"starts_at\":\"...\",\"ends_at\":\"...\",\"timezone\":\"...\",\"location\":\"...\",\"all_day\":false}}.",
  ].join("\n");
}

async function resolveCalendarEvent(job, step) {
  const timezone = jobTimezone(job);
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: job.organization_id,
    party_id: job.requested_by_party_id || null,
    system: resolverSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        objective: job.objective,
        instruction: step.instruction,
        governed_target_party_id: step.target_party_id || null,
        time_context: {
          now: new Date().toISOString(),
          timezone,
        },
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "STRUCTURE_CALENDAR_JOB_STEP",
      secretary_job_id: job.id,
      secretary_job_step_id: step.id,
      raw_reasoning_persisted: false,
      external_authority_used: false,
    },
    mode: "fast",
    max_output_tokens: 700,
  });

  const parsed = object(result?.parsed);
  if (upper(parsed.status) !== "RESOLVED") {
    return {
      status: "review",
      reason: "SECRETARY_JOB_EVENT_TIME_REQUIRES_STRUCTURED_DATE",
      resolution_reason: text(parsed.reason, 1000) || null,
    };
  }

  const event = object(parsed.event);
  const startsAt = exactTimestamp(event.starts_at || event.startsAt);
  const endsAt = exactTimestamp(event.ends_at || event.endsAt);
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
    return {
      status: "review",
      reason: "SECRETARY_JOB_EVENT_TIME_REQUIRES_STRUCTURED_DATE",
      resolution_reason: "SECRETARY_JOB_EVENT_TIMESTAMP_INVALID_OR_AMBIGUOUS",
    };
  }

  return {
    status: "resolved",
    event: {
      title: text(event.title, 500) || text(step.instruction, 500),
      description: text(event.description, 4000) || text(step.instruction, 4000),
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: text(event.timezone, 120) || timezone,
      location: text(event.location, 1000) || null,
      all_day: event.all_day === true || event.allDay === true,
    },
  };
}

export async function executeSecretaryJobCalendarStep({ job, step } = {}) {
  const resolution = await resolveCalendarEvent(job, step);
  if (resolution.status !== "resolved") return resolution;

  try {
    const created = await createSecretaryCalendarEventAtomic({
      context: {
        organizationId: job.organization_id,
        entityId: job.entity_id || null,
        timezone: resolution.event.timezone,
        actor: { partyId: job.requested_by_party_id || null },
        metadata: { partyId: job.requested_by_party_id || null },
      },
      payload: {
        title: resolution.event.title,
        description: resolution.event.description,
        starts_at: resolution.event.starts_at,
        ends_at: resolution.event.ends_at,
        timezone: resolution.event.timezone,
        all_day: resolution.event.all_day,
        location: resolution.event.location,
        event_type: "MEETING",
        status: "CONFIRMED",
        contact_party_id: step.target_party_id || null,
        metadata: {
          secretary_job_id: job.id,
          secretary_job_step_id: step.id,
          execution_owner: "SECRETARY",
          structured_by_existing_intelligence: true,
          external_authority_used: false,
        },
      },
    });

    return {
      status: "completed",
      result: `Created governed Secretary calendar event ${created.event?.id || ""}`.trim(),
      metadata: {
        ...object(step.metadata),
        created_event_id: created.event?.id || null,
        calendar_starts_at: resolution.event.starts_at,
        calendar_ends_at: resolution.event.ends_at,
        calendar_timezone: resolution.event.timezone,
        atomic_booking: true,
        external_authority_used: false,
      },
    };
  } catch (error) {
    const message = text(error?.message || error, 1200);
    if (message.includes("SECRETARY_CALENDAR_SLOT_UNAVAILABLE")) {
      return { status: "review", reason: "SECRETARY_JOB_EVENT_SLOT_UNAVAILABLE" };
    }
    throw error;
  }
}

export default executeSecretaryJobCalendarStep;
