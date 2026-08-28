import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_APPOINTMENT_ATTENDANCE_STEWARDSHIP_V1";
const SOURCE = "secretary_appointment_attendance_stewardship";
const REGISTER_KEY = "appointment_attendance_stewardship_v1";
const CONFIRMATION_STATES = new Set(["PENDING", "CONFIRMED", "DECLINED"]);
const ATTENDANCE_STATES = new Set(["UNKNOWN", "ATTENDED", "NO_SHOW"]);
const MUTABLE_STATES = new Set(["ACTIVE", "COMPLETED"]);

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function organizationId(context = {}) { const id = text(context.organizationId, 120); if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED"); return id; }
function actorPartyId(context = {}) { const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120); if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED"); return id; }
function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) { if (required) throw new Error(`SECRETARY_APPOINTMENT_ATTENDANCE_${field.toUpperCase()}_REQUIRED`); return null; }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_APPOINTMENT_ATTENDANCE_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}
function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}
function payloadHash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safetyFlags() {
  return {
    confirmation_inferred: false,
    attendance_inferred: false,
    no_show_inferred: false,
    silence_is_confirmation: false,
    decline_cancelled_appointment: false,
    decline_rescheduled_appointment: false,
    calendar_event_modified: false,
    appointment_cancelled_by_secretary: false,
    appointment_rescheduled_by_secretary: false,
    booking_authority_created: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
}
async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function many(result) { const resolved = await result; if (resolved.error) throw resolved.error; return Array.isArray(resolved.data) ? resolved.data : []; }

async function routingFor({ context, instruction, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "CALENDAR_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) throw new Error(`SECRETARY_APPOINTMENT_ATTENDANCE_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function readAppointment(organization, calendarEventId) {
  const id = text(calendarEventId, 120);
  if (!id) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CALENDAR_EVENT_ID_REQUIRED");
  const event = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("id,organization_id,entity_id,owner_party_id,contact_party_id,title,event_type,status,starts_at,ends_at,timezone,location,updated_at")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!event) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_APPOINTMENT_NOT_FOUND");
  if (event.event_type !== "APPOINTMENT") throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_EVENT_TYPE_INVALID");
  return event;
}

async function preferredActionType(organization, partyId) {
  if (!partyId) return "REVIEW";
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel,allow_calls,allow_messages")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  const preferred = text(profile?.preferred_channel, 80).toLowerCase();
  if (preferred.includes("email")) return "EMAIL";
  if (profile?.allow_messages !== false) return "MESSAGE";
  if (profile?.allow_calls !== false) return "CALL";
  return "REVIEW";
}

function stewardshipIdFor(organization, calendarEventId) {
  return deterministicUuid(`avantiqo-secretary-appointment-attendance-stewardship-v1:${organization}:${calendarEventId}`);
}
function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_RECORD_INVALID");
  return {
    ...register,
    confirmation_history: list(register.confirmation_history),
    attendance_history: list(register.attendance_history),
    schedule_history: list(register.schedule_history),
    history: list(register.history),
  };
}
async function readTask(organization, stewardshipId) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", stewardshipId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_STEWARDSHIP_NOT_FOUND");
  return task;
}
function scheduleMatches(register, event) {
  return Boolean(
    event &&
    String(event.starts_at || "") === String(register.starts_at || "") &&
    String(event.ends_at || "") === String(register.ends_at || "") &&
    String(event.contact_party_id || "") === String(register.contact_party_id || "")
  );
}
function response(task, register, event = null, extra = {}) {
  return {
    status: "completed",
    contract: CONTRACT,
    stewardship: task,
    record: register,
    calendar_event_status: event?.status || null,
    schedule_matches: event ? scheduleMatches(register, event) : null,
    ...extra,
    ...safetyFlags(),
  };
}

function followUpId(stewardshipId, kind, version) {
  return deterministicUuid(`avantiqo-secretary-appointment-attendance-follow-up-v1:${stewardshipId}:${kind}:${version}`);
}
async function ensureFollowUp({ task, register, kind, dueAt, targetPartyId = null, actionType = null, actor, routing, instruction }) {
  const id = followUpId(task.id, kind, register.version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const resolvedActionType = actionType || await preferredActionType(task.organization_id, targetPartyId);
  return one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      id,
      organization_id: task.organization_id,
      entity_id: task.entity_id,
      owner_party_id: register.operational_assignee_party_id || task.owner_party_id,
      contact_party_id: targetPartyId || null,
      task_id: task.id,
      calendar_event_id: register.calendar_event_id,
      action_type: resolvedActionType,
      reason: instruction,
      status: "PENDING",
      due_at: dueAt,
      created_by_party_id: actor,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: Boolean(targetPartyId) && resolvedActionType !== "REVIEW",
        execution_instruction: instruction,
        secretary_owned: true,
        secretary_appointment_attendance_stewardship: true,
        secretary_appointment_attendance_stewardship_contract: CONTRACT,
        appointment_attendance_stewardship_id: task.id,
        appointment_attendance_follow_up_kind: kind,
        canonical_owner_party_id: register.canonical_owner_party_id,
        requires_owner_authority: false,
        ...secretaryAdministrativeCoverageMetadata(routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
}
async function cancelPendingFollowUps(task, reason, kinds = null) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const allowed = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_appointment_attendance_stewardship_contract !== CONTRACT) return false;
    if (!allowed) return true;
    return allowed.has(text(metadata.appointment_attendance_follow_up_kind, 80));
  }).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids;
}

async function mutate({ context, payload, eventName, instruction, allowedStates = MUTABLE_STATES, producer }) {
  const stewardshipId = text(payload.stewardship_id || payload.stewardshipId, 120);
  if (!stewardshipId) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_STEWARDSHIP_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = payloadHash(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, stewardshipId);
    const register = registerFromTask(task);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) {
      if (replay.event === eventName && replay.payload_sha256 === hash) {
        const event = await readAppointment(auth.organization, register.calendar_event_id);
        return response(task, register, event, { replay_safe: true });
      }
      throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_EVIDENCE_REUSE_CONFLICT");
    }
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_APPOINTMENT_ATTENDANCE_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_STALE_VERSION");
    const event = await readAppointment(auth.organization, register.calendar_event_id);
    const produced = await producer({ task, register, event, auth, occurredAt, evidenceId, hash });
    const next = {
      ...register,
      ...object(produced.patch),
      contract: CONTRACT,
      version: expectedVersion + 1,
      history: [...register.history, {
        event: eventName,
        evidence_id: evidenceId,
        occurred_at: occurredAt,
        recorded_by_party_id: auth.actor,
        payload_sha256: hash,
        ...object(produced.historyDetails),
        ...safetyFlags(),
      }].slice(-500),
      ...safetyFlags(),
    };
    const terminal = ["COMPLETED", "CANCELLED"].includes(next.state);
    const update = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: next.state === "CANCELLED" ? "CANCELLED" : next.state === "COMPLETED" ? "DONE" : "IN_PROGRESS",
        completed_at: terminal ? occurredAt : null,
        due_at: next.starts_at,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_appointment_attendance_stewardship_contract: CONTRACT,
          secretary_appointment_attendance_stewardship_state: next.state,
          ...secretaryAdministrativeCoverageMetadata(auth.routing),
          ...safetyFlags(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) continue;
    if (produced.cancelKinds?.length) await cancelPendingFollowUps(update.data, produced.cancelReason || "Appointment stewardship evidence updated.", produced.cancelKinds);
    if (terminal) await cancelPendingFollowUps(update.data, "Appointment attendance stewardship reached terminal state.");
    for (const followUp of list(produced.followUps)) {
      await ensureFollowUp({ task: update.data, register: next, actor: auth.actor, routing: auth.routing, ...followUp });
    }
    return response(update.data, next, event, { replay_safe: false });
  }
  throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryAppointmentAttendanceStewardship({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_EVIDENCE_REQUIRED");
  const startedAt = iso(payload.started_at || payload.startedAt, "started_at");
  const auth = await routingFor({ context, instruction: "Start appointment confirmation and attendance stewardship", at: startedAt });
  const event = await readAppointment(auth.organization, payload.calendar_event_id || payload.calendarEventId);
  if (!["TENTATIVE", "CONFIRMED"].includes(event.status)) throw new Error(`SECRETARY_APPOINTMENT_ATTENDANCE_APPOINTMENT_STATE_INVALID:${event.status}`);
  if (!event.contact_party_id) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CONTACT_PARTY_REQUIRED");
  const confirmationDueAt = iso(payload.confirmation_due_at || payload.confirmationDueAt, "confirmation_due_at");
  if (Date.parse(confirmationDueAt) >= Date.parse(event.starts_at)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CONFIRMATION_DUE_MUST_PRECEDE_START");
  const stewardshipId = stewardshipIdFor(auth.organization, event.id);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", auth.organization)
      .eq("id", stewardshipId)
      .maybeSingle(),
  );
  if (existing) return response(existing, registerFromTask(existing), event, { replay_safe: true });
  const register = {
    contract: CONTRACT,
    stewardship_id: stewardshipId,
    state: "ACTIVE",
    version: 1,
    calendar_event_id: event.id,
    appointment_title: text(event.title, 600),
    contact_party_id: event.contact_party_id,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: text(event.timezone, 120) || "UTC",
    location: text(event.location, 1000) || null,
    confirmation_due_at: confirmationDueAt,
    confirmation_status: "PENDING",
    confirmation_source_reference: null,
    confirmation_evidence_id: null,
    confirmation_occurred_at: null,
    attendance_status: "UNKNOWN",
    attendance_source_reference: null,
    attendance_evidence_id: null,
    attendance_occurred_at: null,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    confirmation_history: [],
    attendance_history: [],
    schedule_history: [],
    history: [{ event: "STARTED", evidence_id: evidenceId, occurred_at: startedAt, recorded_by_party_id: auth.actor, payload_sha256: payloadHash(payload), ...safetyFlags() }],
    ...safetyFlags(),
  };
  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: stewardshipId,
      organization_id: auth.organization,
      entity_id: event.entity_id || null,
      owner_party_id: auth.operational,
      contact_party_id: event.contact_party_id,
      calendar_event_id: event.id,
      title: `Appointment stewardship: ${text(event.title, 500) || "appointment"}`,
      details: "Evidence-backed appointment confirmation and attendance stewardship. Silence never confirms attendance.",
      status: "IN_PROGRESS",
      priority: "NORMAL",
      due_at: event.starts_at,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_appointment_attendance_stewardship_contract: CONTRACT,
        secretary_appointment_attendance_stewardship_state: register.state,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
  return response(task, register, event, { replay_safe: false });
}

export async function refreshSecretaryAppointmentAttendanceStewardship({ context, payload = {} } = {}) {
  const stewardshipId = text(payload.stewardship_id || payload.stewardshipId, 120);
  if (!stewardshipId) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_STEWARDSHIP_ID_REQUIRED");
  const organization = organizationId(context);
  const task = await readTask(organization, stewardshipId);
  const register = registerFromTask(task);
  if (register.state !== "ACTIVE") throw new Error(`SECRETARY_APPOINTMENT_ATTENDANCE_STATE_INVALID:${register.state}`);
  const event = await readAppointment(organization, register.calendar_event_id);
  if (!scheduleMatches(register, event)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_SCHEDULE_STALE");
  const auth = await routingFor({ context, instruction: "Refresh appointment confirmation and attendance follow-through", at: new Date().toISOString() });
  const rows = [];
  if (register.confirmation_status === "PENDING") {
    const actionType = await preferredActionType(organization, register.contact_party_id);
    rows.push(await ensureFollowUp({
      task,
      register,
      kind: "CONFIRMATION_CHASE",
      dueAt: register.confirmation_due_at,
      targetPartyId: register.contact_party_id,
      actionType,
      actor: auth.actor,
      routing: auth.routing,
      instruction: [
        `Politely ask the contact to explicitly confirm or decline the appointment \"${register.appointment_title || "appointment"}\".`,
        `Appointment time: ${register.starts_at} to ${register.ends_at} (${register.timezone}).`,
        register.location ? `Location: ${register.location}.` : null,
        "Do not treat silence, delivery, a reminder, or a prior tentative status as confirmation or attendance.",
        "If the contact wants a different time or cancellation, use the governed appointment reschedule/cancel path; do not mutate the appointment from this follow-up.",
      ].filter(Boolean).join(" "),
    }));
  } else if (register.confirmation_status === "DECLINED") {
    rows.push(await ensureFollowUp({
      task,
      register,
      kind: "DECLINED_REVIEW",
      dueAt: register.confirmation_occurred_at || new Date().toISOString(),
      targetPartyId: null,
      actionType: "REVIEW",
      actor: auth.actor,
      routing: auth.routing,
      instruction: "The contact explicitly declined this appointment. Review whether a governed cancellation or reschedule action is needed. The appointment remains unchanged by attendance stewardship.",
    }));
  }
  if (register.attendance_status === "UNKNOWN") {
    rows.push(await ensureFollowUp({
      task,
      register,
      kind: "ATTENDANCE_REVIEW",
      dueAt: register.ends_at,
      targetPartyId: null,
      actionType: "REVIEW",
      actor: auth.actor,
      routing: auth.routing,
      instruction: "After the appointment, record explicit ATTENDED or NO_SHOW evidence. Do not infer attendance or no-show from silence, calendar status, notification delivery, or lack of a message.",
    }));
  }
  return response(task, register, event, { follow_up_count: rows.length, follow_up_ids: rows.filter(Boolean).map((row) => row.id) });
}

export async function recordSecretaryAppointmentConfirmation({ context, payload = {} } = {}) {
  const confirmationStatus = text(payload.confirmation_status || payload.confirmationStatus, 40).toUpperCase();
  if (!CONFIRMATION_STATES.has(confirmationStatus) || confirmationStatus === "PENDING") throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CONFIRMATION_STATUS_INVALID");
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1200);
  if (!sourceReference) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CONFIRMATION_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "CONFIRMATION_RECORDED",
    instruction: `Record explicit appointment confirmation state ${confirmationStatus}`,
    allowedStates: new Set(["ACTIVE"]),
    producer: async ({ register, event, occurredAt, evidenceId }) => {
      if (!scheduleMatches(register, event)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_SCHEDULE_STALE");
      if (Date.parse(occurredAt) > Date.parse(register.ends_at)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CONFIRMATION_AFTER_APPOINTMENT");
      const prior = register.confirmation_status === "PENDING" ? null : {
        confirmation_status: register.confirmation_status,
        source_reference: register.confirmation_source_reference,
        evidence_id: register.confirmation_evidence_id,
        occurred_at: register.confirmation_occurred_at,
      };
      return {
        patch: {
          confirmation_status: confirmationStatus,
          confirmation_source_reference: sourceReference,
          confirmation_evidence_id: evidenceId,
          confirmation_occurred_at: occurredAt,
          confirmation_history: prior ? [...register.confirmation_history, prior].slice(-25) : register.confirmation_history,
        },
        cancelKinds: ["CONFIRMATION_CHASE", "DECLINED_REVIEW"],
        cancelReason: "Explicit appointment confirmation/decline evidence recorded.",
        followUps: confirmationStatus === "DECLINED" ? [{
          kind: "DECLINED_REVIEW",
          dueAt: occurredAt,
          targetPartyId: null,
          actionType: "REVIEW",
          instruction: "The contact explicitly declined this appointment. Review whether a governed cancellation or reschedule action is needed. Do not cancel or reschedule the appointment merely because this stewardship record says DECLINED.",
        }] : [],
        historyDetails: { confirmation_status: confirmationStatus, source_reference: sourceReference },
      };
    },
  });
}

export async function syncSecretaryAppointmentAttendanceSchedule({ context, payload = {} } = {}) {
  const confirmationDueAt = iso(payload.confirmation_due_at || payload.confirmationDueAt, "confirmation_due_at");
  return mutate({
    context,
    payload,
    eventName: "SCHEDULE_SYNCED",
    instruction: "Synchronize appointment attendance stewardship to an already changed canonical appointment",
    allowedStates: new Set(["ACTIVE"]),
    producer: async ({ register, event }) => {
      if (event.status === "CANCELLED") throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_APPOINTMENT_CANCELLED");
      if (scheduleMatches(register, event)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_SCHEDULE_UNCHANGED");
      if (!event.contact_party_id) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CONTACT_PARTY_REQUIRED");
      if (Date.parse(confirmationDueAt) >= Date.parse(event.starts_at)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CONFIRMATION_DUE_MUST_PRECEDE_START");
      const previousSchedule = {
        starts_at: register.starts_at,
        ends_at: register.ends_at,
        timezone: register.timezone,
        location: register.location,
        contact_party_id: register.contact_party_id,
        confirmation_due_at: register.confirmation_due_at,
        confirmation_status: register.confirmation_status,
        confirmation_source_reference: register.confirmation_source_reference,
        confirmation_evidence_id: register.confirmation_evidence_id,
        confirmation_occurred_at: register.confirmation_occurred_at,
      };
      return {
        patch: {
          appointment_title: text(event.title, 600),
          contact_party_id: event.contact_party_id,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          timezone: text(event.timezone, 120) || "UTC",
          location: text(event.location, 1000) || null,
          confirmation_due_at: confirmationDueAt,
          confirmation_status: "PENDING",
          confirmation_source_reference: null,
          confirmation_evidence_id: null,
          confirmation_occurred_at: null,
          attendance_status: "UNKNOWN",
          attendance_source_reference: null,
          attendance_evidence_id: null,
          attendance_occurred_at: null,
          schedule_history: [...register.schedule_history, previousSchedule].slice(-25),
        },
        cancelKinds: ["CONFIRMATION_CHASE", "DECLINED_REVIEW", "ATTENDANCE_REVIEW"],
        cancelReason: "Canonical appointment schedule changed; stale stewardship follow-ups cancelled.",
        historyDetails: { prior_starts_at: register.starts_at, new_starts_at: event.starts_at },
      };
    },
  });
}

export async function recordSecretaryAppointmentAttendance({ context, payload = {} } = {}) {
  const attendanceStatus = text(payload.attendance_status || payload.attendanceStatus, 40).toUpperCase();
  if (!ATTENDANCE_STATES.has(attendanceStatus) || attendanceStatus === "UNKNOWN") throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_STATUS_INVALID");
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1200);
  if (!sourceReference) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "ATTENDANCE_RECORDED",
    instruction: `Record explicit appointment attendance state ${attendanceStatus}`,
    allowedStates: new Set(["ACTIVE", "COMPLETED"]),
    producer: async ({ register, event, occurredAt, evidenceId }) => {
      if (!scheduleMatches(register, event)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_SCHEDULE_STALE");
      if (attendanceStatus === "ATTENDED" && Date.parse(occurredAt) < Date.parse(register.starts_at)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_TOO_EARLY");
      if (attendanceStatus === "NO_SHOW" && Date.parse(occurredAt) < Date.parse(register.ends_at)) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_NO_SHOW_TOO_EARLY");
      const prior = register.attendance_status === "UNKNOWN" ? null : {
        attendance_status: register.attendance_status,
        source_reference: register.attendance_source_reference,
        evidence_id: register.attendance_evidence_id,
        occurred_at: register.attendance_occurred_at,
      };
      return {
        patch: {
          state: "COMPLETED",
          attendance_status: attendanceStatus,
          attendance_source_reference: sourceReference,
          attendance_evidence_id: evidenceId,
          attendance_occurred_at: occurredAt,
          attendance_history: prior ? [...register.attendance_history, prior].slice(-25) : register.attendance_history,
        },
        cancelKinds: ["CONFIRMATION_CHASE", "DECLINED_REVIEW", "ATTENDANCE_REVIEW"],
        cancelReason: "Explicit appointment attendance/no-show evidence recorded.",
        historyDetails: { attendance_status: attendanceStatus, source_reference: sourceReference },
      };
    },
  });
}

export async function cancelSecretaryAppointmentAttendanceStewardship({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1200);
  if (!reason) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_CANCEL_REASON_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "STEWARDSHIP_CANCELLED",
    instruction: "Cancel only appointment attendance stewardship",
    allowedStates: new Set(["ACTIVE"]),
    producer: async () => ({ patch: { state: "CANCELLED" }, historyDetails: { reason } }),
  });
}

export async function readSecretaryAppointmentAttendanceStewardship({ context, payload = {} } = {}) {
  const stewardshipId = text(payload.stewardship_id || payload.stewardshipId, 120);
  if (!stewardshipId) throw new Error("SECRETARY_APPOINTMENT_ATTENDANCE_STEWARDSHIP_ID_REQUIRED");
  const organization = organizationId(context);
  const task = await readTask(organization, stewardshipId);
  const register = registerFromTask(task);
  const event = await readAppointment(organization, register.calendar_event_id);
  return response(task, register, event);
}

export async function listSecretaryAppointmentAttendanceStewardship({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const limit = Math.max(1, Math.min(200, Number(payload.limit) || 50));
  const rows = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", SOURCE)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  const items = [];
  for (const task of rows) {
    const register = registerFromTask(task);
    const event = await readAppointment(organization, register.calendar_event_id);
    items.push({ task, record: register, calendar_event_status: event.status, schedule_matches: scheduleMatches(register, event) });
  }
  return { status: "completed", contract: CONTRACT, items, ...safetyFlags() };
}

export default Object.freeze({
  start: startSecretaryAppointmentAttendanceStewardship,
  refresh: refreshSecretaryAppointmentAttendanceStewardship,
  recordConfirmation: recordSecretaryAppointmentConfirmation,
  syncSchedule: syncSecretaryAppointmentAttendanceSchedule,
  recordAttendance: recordSecretaryAppointmentAttendance,
  cancel: cancelSecretaryAppointmentAttendanceStewardship,
  read: readSecretaryAppointmentAttendanceStewardship,
  list: listSecretaryAppointmentAttendanceStewardship,
});
