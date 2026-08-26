import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_VISITOR_COORDINATION_V1";
const KIND = "VISITOR_COORDINATION";
const TERMINAL_STATES = new Set(["CANCELLED", "DECLINED", "COMPLETED", "NO_SHOW"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function organizationId(context = {}) {
  const value = text(context.organizationId, 120);
  if (!value) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return value;
}

function actorPartyId(context = {}) {
  const value = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!value) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return value;
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function coordinationTaskId(organization, calendarEventId, visitorPartyId) {
  return deterministicUuid(`avantiqo-secretary-visitor-coordination-v1:${organization}:${calendarEventId}:${visitorPartyId}`);
}

function coordinationFollowUpId(taskId, partyId, kind, version) {
  return deterministicUuid(`avantiqo-secretary-visitor-follow-up-v1:${taskId}:${partyId}:${kind}:${version}`);
}

function eventSnapshot(event) {
  return {
    title: text(event.title, 500),
    starts_at: text(event.starts_at, 160),
    ends_at: text(event.ends_at, 160),
    timezone: text(event.timezone, 120) || null,
    location: text(event.location, 1000) || null,
  };
}

function sameSnapshot(left, right) {
  return JSON.stringify(eventSnapshot(left)) === JSON.stringify(eventSnapshot(right));
}

function normalizeArrivalInstructions(value = {}) {
  const row = object(value);
  return {
    address: text(row.address, 1000) || null,
    entrance: text(row.entrance, 600) || null,
    check_in_point: text(row.check_in_point || row.checkInPoint, 600) || null,
    parking: text(row.parking, 1000) || null,
    contact_note: text(row.contact_note || row.contactNote, 1000) || null,
    notes: text(row.notes, 1600) || null,
  };
}

async function resolveEvent(organization, calendarEventId, { allowCancelled = false, allowEnded = false } = {}) {
  const eventId = text(calendarEventId, 120);
  if (!eventId) throw new Error("SECRETARY_VISITOR_COORDINATION_CALENDAR_EVENT_REQUIRED");
  const event = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", eventId)
      .maybeSingle(),
  );
  if (!event) throw new Error("SECRETARY_VISITOR_COORDINATION_CALENDAR_EVENT_NOT_FOUND");
  if (!allowCancelled && event.status === "CANCELLED") throw new Error("SECRETARY_VISITOR_COORDINATION_CALENDAR_EVENT_CANCELLED");
  if (!allowEnded && Date.parse(event.ends_at) <= Date.now()) throw new Error("SECRETARY_VISITOR_COORDINATION_VISIT_ALREADY_ENDED");
  return event;
}

function visitorPartyId(payload = {}, event = {}) {
  const value = text(payload.visitor_party_id || payload.visitorPartyId || event.contact_party_id, 120);
  if (!value) throw new Error("SECRETARY_VISITOR_COORDINATION_VISITOR_PARTY_REQUIRED");
  return value;
}

async function preferredActionType(organization, partyId, fallback = "MESSAGE") {
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  const preferred = text(profile?.preferred_channel, 120).toLowerCase();
  return preferred.includes("email") ? "EMAIL" : fallback;
}

function chaseAt(event, minimumLeadMs = 30 * 60 * 1000) {
  const now = Date.now();
  const starts = Date.parse(event.starts_at);
  const latest = starts - minimumLeadMs;
  if (!Number.isFinite(starts) || latest <= now + 2 * 60 * 1000) return null;
  return new Date(now + Math.max(60 * 1000, Math.floor((latest - now) / 2))).toISOString();
}

async function loadTask(organization, eventId, visitorId) {
  return one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", coordinationTaskId(organization, eventId, visitorId))
      .maybeSingle(),
  );
}

async function mutateTask(organization, eventId, visitorId, producer) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const task = await loadTask(organization, eventId, visitorId);
    if (!task) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");
    const produced = await producer(task, object(task.metadata));
    const patch = {
      ...object(produced.task_patch),
      metadata: produced.metadata,
      updated_at: new Date().toISOString(),
    };
    const update = await supabaseAdmin.from("secretary_tasks")
      .update(patch)
      .eq("organization_id", organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) return { task: update.data, output: object(produced.output) };
  }
  throw new Error("SECRETARY_VISITOR_COORDINATION_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function ensureFollowUp({ task, event, partyId, kind, version, dueAt = null, instruction }) {
  const id = coordinationFollowUpId(task.id, partyId, kind, version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const actionType = await preferredActionType(task.organization_id, partyId);
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: task.owner_party_id || null,
    contact_party_id: partyId,
    task_id: task.id,
    calendar_event_id: event.id,
    action_type: actionType,
    reason: text(instruction, 4000),
    status: "PENDING",
    due_at: dueAt || new Date().toISOString(),
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: text(instruction, 4000),
      secretary_owned: true,
      secretary_visitor_coordination: true,
      secretary_visitor_coordination_task_id: task.id,
      secretary_visitor_coordination_kind: kind,
      secretary_visitor_coordination_version: version,
      physical_access_authority_created: false,
      physical_access_granted_by_secretary: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin.from("secretary_follow_ups")
          .select("*")
          .eq("organization_id", task.organization_id)
          .eq("id", id)
          .single(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function cancelFollowUps({ task, kinds = null, version = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(500),
  );
  const allowedKinds = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_visitor_coordination !== true) return false;
    if (allowedKinds && !allowedKinds.has(text(metadata.secretary_visitor_coordination_kind, 100))) return false;
    if (version !== null && Number(metadata.secretary_visitor_coordination_version) !== Number(version)) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const update = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1000), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (update.error) throw update.error;
  return ids.length;
}

function hostInstruction(event) {
  return [
    `Confirm whether you approve hosting the visitor for "${text(event.title, 500)}" on ${event.starts_at} to ${event.ends_at}${event.location ? ` at ${text(event.location, 500)}` : ""}.`,
    "Reply explicitly yes or no. This is host confirmation only and does not grant physical access, a badge, parking, or security clearance.",
  ].join(" ");
}

function visitorInstruction(event) {
  return [
    `Please explicitly confirm the visit "${text(event.title, 500)}" on ${event.starts_at} to ${event.ends_at}${event.location ? ` at ${text(event.location, 500)}` : ""}.`,
    "Reply yes or no so the Secretary can coordinate reception and arrival details. Confirmation does not itself grant physical access.",
  ].join(" ");
}

function accessInstruction(event, metadata) {
  const requested = [
    metadata.badge_required ? "badge" : null,
    metadata.parking_required ? "parking" : null,
    metadata.escort_required ? "escort" : null,
    "visitor access",
  ].filter(Boolean).join(", ");
  return [
    `Request an explicit authorized security/reception decision for ${requested} for the visit "${text(event.title, 500)}" on ${event.starts_at} to ${event.ends_at}${event.location ? ` at ${text(event.location, 500)}` : ""}.`,
    "The Executive Secretary is requesting access only. Do not treat this request as approval and do not issue, activate, promise, or infer any physical access. Record the authorized decision with evidence.",
  ].join(" ");
}

function receptionInstruction(event, metadata) {
  return [
    `Notify reception of the confirmed visitor appointment "${text(event.title, 500)}" on ${event.starts_at} to ${event.ends_at}${event.location ? ` at ${text(event.location, 500)}` : ""}.`,
    metadata.access_required ? `Recorded access status: ${metadata.access_status}.` : "No separate access approval was requested by this coordination.",
    "This is an informational reception notice only. Do not bypass onsite security policy or infer any additional access authority.",
  ].join(" ");
}

function arrivalInstruction(event, metadata) {
  const instructions = object(metadata.arrival_instructions);
  const details = [
    instructions.address ? `Address: ${instructions.address}` : null,
    instructions.entrance ? `Entrance: ${instructions.entrance}` : null,
    instructions.check_in_point ? `Check-in: ${instructions.check_in_point}` : null,
    instructions.parking ? `Parking information: ${instructions.parking}` : null,
    instructions.contact_note ? `Contact: ${instructions.contact_note}` : null,
    instructions.notes ? `Notes: ${instructions.notes}` : null,
  ].filter(Boolean);
  return [
    `Send arrival instructions for the confirmed visit "${text(event.title, 500)}" on ${event.starts_at} to ${event.ends_at}${event.location ? ` at ${text(event.location, 500)}` : ""}.`,
    ...details,
    metadata.access_required
      ? "An explicit access decision has been recorded as APPROVED by the configured access authority. This message does not itself grant access; onsite security procedures still apply."
      : "This message does not grant or imply any physical access beyond normal onsite policy.",
    "Ask the visitor only to acknowledge receipt of these arrival instructions.",
  ].join(" ");
}

function receiptChaseInstruction(event) {
  return [
    `Follow up once to confirm receipt of the arrival instructions for "${text(event.title, 500)}" on ${event.starts_at}.`,
    "Ask only whether the instructions were received. Do not treat receipt as arrival, admission, access approval, or any new commitment.",
  ].join(" ");
}

async function ensureRequestAndChase({ task, event, partyId, requestKind, chaseKind, version, instruction }) {
  const request = await ensureFollowUp({ task, event, partyId, kind: requestKind, version, instruction });
  const chaseDue = chaseAt(event);
  let chase = null;
  if (chaseDue) chase = await ensureFollowUp({ task, event, partyId, kind: chaseKind, version, dueAt: chaseDue, instruction });
  return [request?.id, chase?.id].filter(Boolean);
}

async function progressCoordination({ organization, event, visitorId }) {
  let task = await loadTask(organization, event.id, visitorId);
  if (!task) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");

  for (let step = 0; step < 6; step += 1) {
    const metadata = object(task.metadata);
    const version = Number(metadata.instruction_version || 1);
    if (TERMINAL_STATES.has(metadata.coordination_state)) return task;

    if (metadata.host_confirmation_status === "PENDING") {
      await ensureRequestAndChase({
        task,
        event,
        partyId: metadata.host_party_id,
        requestKind: "HOST_CONFIRMATION_REQUEST",
        chaseKind: "HOST_CONFIRMATION_CHASE",
        version,
        instruction: hostInstruction(event),
      });
    }
    if (metadata.visitor_confirmation_status === "PENDING") {
      await ensureRequestAndChase({
        task,
        event,
        partyId: metadata.visitor_party_id,
        requestKind: "VISITOR_CONFIRMATION_REQUEST",
        chaseKind: "VISITOR_CONFIRMATION_CHASE",
        version,
        instruction: visitorInstruction(event),
      });
    }

    if ([metadata.host_confirmation_status, metadata.visitor_confirmation_status].includes("DECLINED")) {
      await cancelFollowUps({ task, version, reason: "Visitor coordination declined by an explicitly recorded party response." });
      const declined = await mutateTask(organization, event.id, visitorId, async (_current, currentMetadata) => ({
        metadata: {
          ...currentMetadata,
          coordination_state: "DECLINED",
          declined_at: new Date().toISOString(),
          physical_access_authority_created: false,
          physical_access_granted_by_secretary: false,
          external_authority_used: false,
        },
        task_patch: { status: "CANCELLED" },
      }));
      return declined.task;
    }

    if (metadata.host_confirmation_status !== "CONFIRMED" || metadata.visitor_confirmation_status !== "CONFIRMED") return task;

    if (metadata.access_required === true && metadata.access_status === "PENDING") {
      if (!metadata.security_party_id) {
        const missing = await mutateTask(organization, event.id, visitorId, async (_current, currentMetadata) => ({
          metadata: {
            ...currentMetadata,
            coordination_state: "NEEDS_INPUT",
            access_status: "MISSING_SECURITY_CONTACT",
            physical_access_authority_created: false,
            physical_access_granted_by_secretary: false,
            external_authority_used: false,
          },
        }));
        return missing.task;
      }
      const ids = await ensureRequestAndChase({
        task,
        event,
        partyId: metadata.security_party_id,
        requestKind: "ACCESS_REQUEST",
        chaseKind: "ACCESS_CHASE",
        version,
        instruction: accessInstruction(event, metadata),
      });
      const requested = await mutateTask(organization, event.id, visitorId, async (_current, currentMetadata) => ({
        metadata: {
          ...currentMetadata,
          coordination_state: "WAITING_ACCESS",
          access_status: "REQUESTED",
          access_requested_at: currentMetadata.access_requested_at || new Date().toISOString(),
          access_follow_up_ids: [...new Set([...list(currentMetadata.access_follow_up_ids), ...ids])],
          physical_access_authority_created: false,
          physical_access_granted_by_secretary: false,
          external_authority_used: false,
        },
      }));
      task = requested.task;
      continue;
    }

    if (metadata.access_required === true && metadata.access_status === "MISSING_SECURITY_CONTACT") return task;
    if (metadata.access_required === true && metadata.access_status === "REQUESTED") return task;
    if (metadata.access_required === true && metadata.access_status === "DENIED") {
      const blocked = await mutateTask(organization, event.id, visitorId, async (_current, currentMetadata) => ({
        metadata: {
          ...currentMetadata,
          coordination_state: "BLOCKED_ACCESS",
          physical_access_authority_created: false,
          physical_access_granted_by_secretary: false,
          external_authority_used: false,
        },
      }));
      return blocked.task;
    }

    const accessReady = metadata.access_required !== true || metadata.access_status === "APPROVED";
    if (!accessReady) return task;

    const producedIds = [];
    let receptionStatus = metadata.reception_notification_status;
    if (metadata.reception_party_id) {
      const reception = await ensureFollowUp({
        task,
        event,
        partyId: metadata.reception_party_id,
        kind: "RECEPTION_NOTICE",
        version,
        instruction: receptionInstruction(event, metadata),
      });
      producedIds.push(reception.id);
      receptionStatus = "QUEUED";
    } else receptionStatus = "SKIPPED_NO_CONTACT";

    const arrival = await ensureFollowUp({
      task,
      event,
      partyId: metadata.visitor_party_id,
      kind: "ARRIVAL_INSTRUCTIONS",
      version,
      instruction: arrivalInstruction(event, metadata),
    });
    producedIds.push(arrival.id);
    const receiptDue = chaseAt(event, 15 * 60 * 1000);
    let receiptChase = null;
    if (receiptDue && metadata.visitor_acknowledgement_status !== "ACKNOWLEDGED") {
      receiptChase = await ensureFollowUp({
        task,
        event,
        partyId: metadata.visitor_party_id,
        kind: "ARRIVAL_RECEIPT_CHASE",
        version,
        dueAt: receiptDue,
        instruction: receiptChaseInstruction(event),
      });
      producedIds.push(receiptChase.id);
    }

    const ready = await mutateTask(organization, event.id, visitorId, async (_current, currentMetadata) => ({
      metadata: {
        ...currentMetadata,
        coordination_state: "READY",
        reception_notification_status: receptionStatus,
        arrival_instruction_status: "QUEUED",
        arrival_distribution_queued_at: currentMetadata.arrival_distribution_queued_at || new Date().toISOString(),
        operational_follow_up_ids: [...new Set([...list(currentMetadata.operational_follow_up_ids), ...producedIds])],
        physical_access_authority_created: false,
        physical_access_granted_by_secretary: false,
        external_authority_used: false,
      },
    }));
    return ready.task;
  }
  throw new Error("SECRETARY_VISITOR_COORDINATION_PROGRESS_RETRY_REQUIRED");
}

export async function startSecretaryVisitorCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const event = await resolveEvent(organization, payload.calendar_event_id || payload.calendarEventId);
  const visitorId = visitorPartyId(payload, event);
  const hostId = text(payload.host_party_id || payload.hostPartyId || event.owner_party_id || actor, 120);
  if (!hostId) throw new Error("SECRETARY_VISITOR_COORDINATION_HOST_PARTY_REQUIRED");
  if (hostId === visitorId) throw new Error("SECRETARY_VISITOR_COORDINATION_HOST_AND_VISITOR_MUST_DIFFER");
  const taskId = coordinationTaskId(organization, event.id, visitorId);
  let task = await loadTask(organization, event.id, visitorId);

  if (!task) {
    const hostConfirmed = payload.host_confirmed === true || payload.hostConfirmed === true;
    const visitorConfirmed = payload.visitor_confirmed === true || payload.visitorConfirmed === true;
    const hostEvidence = text(payload.host_confirmation_evidence_id || payload.hostConfirmationEvidenceId, 240) || null;
    const visitorEvidence = text(payload.visitor_confirmation_evidence_id || payload.visitorConfirmationEvidenceId, 240) || null;
    if (hostConfirmed && !hostEvidence) throw new Error("SECRETARY_VISITOR_COORDINATION_HOST_CONFIRMATION_EVIDENCE_REQUIRED");
    if (visitorConfirmed && !visitorEvidence) throw new Error("SECRETARY_VISITOR_COORDINATION_VISITOR_CONFIRMATION_EVIDENCE_REQUIRED");
    const accessRequired = payload.access_required === true || payload.accessRequired === true || payload.badge_required === true || payload.badgeRequired === true || payload.parking_required === true || payload.parkingRequired === true || payload.escort_required === true || payload.escortRequired === true;
    const metadata = {
      secretary_role: "EXECUTIVE_SECRETARY",
      secretary_owned: true,
      visitor_coordination: true,
      visitor_coordination_kind: KIND,
      visitor_coordination_contract: CONTRACT,
      coordination_state: "COORDINATING",
      visitor_party_id: visitorId,
      host_party_id: hostId,
      reception_party_id: text(payload.reception_party_id || payload.receptionPartyId, 120) || null,
      security_party_id: text(payload.security_party_id || payload.securityPartyId, 120) || null,
      instruction_version: 1,
      schedule_snapshot: eventSnapshot(event),
      schedule_history: [],
      host_confirmation_status: hostConfirmed ? "CONFIRMED" : "PENDING",
      host_confirmation_evidence_id: hostEvidence,
      host_confirmed_at: hostConfirmed ? new Date().toISOString() : null,
      visitor_confirmation_status: visitorConfirmed ? "CONFIRMED" : "PENDING",
      visitor_confirmation_evidence_id: visitorEvidence,
      visitor_confirmed_at: visitorConfirmed ? new Date().toISOString() : null,
      access_required: accessRequired,
      badge_required: payload.badge_required === true || payload.badgeRequired === true,
      parking_required: payload.parking_required === true || payload.parkingRequired === true,
      escort_required: payload.escort_required === true || payload.escortRequired === true,
      access_status: accessRequired ? "PENDING" : "NOT_REQUIRED",
      access_requested_at: null,
      access_decision_evidence_id: null,
      access_decision_by_party_id: null,
      access_decision_at: null,
      access_decision_history: [],
      access_follow_up_ids: [],
      arrival_instructions: normalizeArrivalInstructions(payload.arrival_instructions || payload.arrivalInstructions),
      reception_notification_status: "NOT_QUEUED",
      arrival_instruction_status: "NOT_QUEUED",
      visitor_acknowledgement_status: "PENDING",
      visitor_acknowledgement_evidence_id: null,
      arrival_status: "EXPECTED",
      arrival_evidence_history: [],
      operational_follow_up_ids: [],
      schedule_changed_requires_reconfirmation: false,
      physical_access_authority_created: false,
      physical_access_granted_by_secretary: false,
      arrival_not_inferred: true,
      external_authority_used: false,
    };
    const inserted = await supabaseAdmin.from("secretary_tasks").insert({
      id: taskId,
      organization_id: organization,
      entity_id: event.entity_id || context.entityId || null,
      owner_party_id: hostId,
      contact_party_id: visitorId,
      calendar_event_id: event.id,
      title: `Coordinate visitor: ${text(event.title, 420)}`,
      details: `Durable Secretary-owned visitor, reception and access coordination for calendar event ${event.id}.`,
      status: "IN_PROGRESS",
      priority: "HIGH",
      due_at: event.starts_at,
      remind_at: chaseAt(event) || null,
      source: "secretary",
      created_by_party_id: actor,
      metadata,
    }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      task = await loadTask(organization, event.id, visitorId);
    } else task = inserted.data;
  }

  const progressed = await progressCoordination({ organization, event, visitorId });
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,contact_party_id,due_at,metadata")
      .eq("organization_id", organization)
      .eq("task_id", progressed.id)
      .order("created_at", { ascending: true }),
  );
  return {
    status: "started",
    contract: CONTRACT,
    task: progressed,
    calendar_event: event,
    follow_ups: followUps,
    deterministic_task_id: progressed.id === taskId,
    physical_access_authority_created: false,
    physical_access_granted_by_secretary: false,
    external_authority_used: false,
  };
}

async function recordPartyResponse({ context, payload, role }) {
  const organization = organizationId(context);
  const event = await resolveEvent(organization, payload.calendar_event_id || payload.calendarEventId);
  const visitorId = visitorPartyId(payload, event);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  if (!evidenceId) throw new Error(`SECRETARY_VISITOR_COORDINATION_${role}_EVIDENCE_REQUIRED`);
  const confirmed = payload.confirmed;
  if (confirmed !== true && confirmed !== false) throw new Error(`SECRETARY_VISITOR_COORDINATION_${role}_CONFIRMED_BOOLEAN_REQUIRED`);
  const current = await loadTask(organization, event.id, visitorId);
  if (!current) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");
  const metadata = object(current.metadata);
  const expectedParty = role === "HOST" ? metadata.host_party_id : metadata.visitor_party_id;
  const responseParty = text(payload.party_id || payload.partyId || expectedParty, 120);
  if (responseParty !== expectedParty) throw new Error(`SECRETARY_VISITOR_COORDINATION_${role}_PARTY_MISMATCH`);
  const statusKey = role === "HOST" ? "host_confirmation_status" : "visitor_confirmation_status";
  const evidenceKey = role === "HOST" ? "host_confirmation_evidence_id" : "visitor_confirmation_evidence_id";
  const atKey = role === "HOST" ? "host_confirmed_at" : "visitor_confirmed_at";
  if (metadata[evidenceKey] === evidenceId && metadata[statusKey] === (confirmed ? "CONFIRMED" : "DECLINED")) {
    const progressed = await progressCoordination({ organization, event, visitorId });
    return { status: "response_already_recorded", task: progressed, idempotent: true, external_authority_used: false };
  }
  if (["CONFIRMED", "DECLINED"].includes(metadata[statusKey]) && metadata[evidenceKey] !== evidenceId) {
    throw new Error(`SECRETARY_VISITOR_COORDINATION_${role}_RESPONSE_ALREADY_RECORDED`);
  }
  const version = Number(metadata.instruction_version || 1);
  const changed = await mutateTask(organization, event.id, visitorId, async (_task, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      [statusKey]: confirmed ? "CONFIRMED" : "DECLINED",
      [evidenceKey]: evidenceId,
      [atKey]: new Date().toISOString(),
      physical_access_authority_created: false,
      physical_access_granted_by_secretary: false,
      external_authority_used: false,
    },
  }));
  await cancelFollowUps({
    task: changed.task,
    kinds: role === "HOST" ? ["HOST_CONFIRMATION_REQUEST", "HOST_CONFIRMATION_CHASE"] : ["VISITOR_CONFIRMATION_REQUEST", "VISITOR_CONFIRMATION_CHASE"],
    version,
    reason: `${role} response recorded with explicit evidence.`,
  });
  const progressed = await progressCoordination({ organization, event, visitorId });
  return {
    status: confirmed ? "confirmed" : "declined",
    task: progressed,
    evidence_required: true,
    physical_access_authority_created: false,
    physical_access_granted_by_secretary: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryVisitorHostResponse({ context, payload = {} } = {}) {
  return recordPartyResponse({ context, payload, role: "HOST" });
}

export async function recordSecretaryVisitorResponse({ context, payload = {} } = {}) {
  return recordPartyResponse({ context, payload, role: "VISITOR" });
}

export async function recordSecretaryVisitorAccessDecision({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const event = await resolveEvent(organization, payload.calendar_event_id || payload.calendarEventId);
  const visitorId = visitorPartyId(payload, event);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  if (!evidenceId) throw new Error("SECRETARY_VISITOR_COORDINATION_ACCESS_DECISION_EVIDENCE_REQUIRED");
  const decision = text(payload.decision, 40).toUpperCase();
  if (!["APPROVED", "DENIED"].includes(decision)) throw new Error("SECRETARY_VISITOR_COORDINATION_ACCESS_DECISION_INVALID");
  const current = await loadTask(organization, event.id, visitorId);
  if (!current) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");
  const metadata = object(current.metadata);
  if (metadata.access_required !== true) throw new Error("SECRETARY_VISITOR_COORDINATION_ACCESS_NOT_REQUIRED");
  const securityPartyId = text(metadata.security_party_id, 120);
  if (!securityPartyId) throw new Error("SECRETARY_VISITOR_COORDINATION_SECURITY_PARTY_REQUIRED");
  const decisionBy = text(payload.decision_by_party_id || payload.decisionByPartyId, 120);
  if (!decisionBy) throw new Error("SECRETARY_VISITOR_COORDINATION_ACCESS_DECISION_BY_PARTY_REQUIRED");
  if (decisionBy !== securityPartyId) throw new Error("SECRETARY_VISITOR_COORDINATION_ACCESS_DECISION_AUTHORITY_MISMATCH");
  if (metadata.access_decision_evidence_id === evidenceId && metadata.access_status === decision) {
    const progressed = await progressCoordination({ organization, event, visitorId });
    return { status: "access_decision_already_recorded", task: progressed, idempotent: true, physical_access_granted_by_secretary: false, external_authority_used: false };
  }
  const version = Number(metadata.instruction_version || 1);
  const now = new Date().toISOString();
  const changed = await mutateTask(organization, event.id, visitorId, async (_task, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      access_status: decision,
      access_decision_evidence_id: evidenceId,
      access_decision_by_party_id: decisionBy,
      access_decision_at: now,
      access_decision_history: [...list(currentMetadata.access_decision_history), {
        version,
        decision,
        evidence_id: evidenceId,
        decision_by_party_id: decisionBy,
        recorded_at: now,
      }].slice(-20),
      coordination_state: decision === "DENIED" ? "BLOCKED_ACCESS" : "COORDINATING",
      physical_access_authority_created: false,
      physical_access_granted_by_secretary: false,
      external_authority_used: false,
    },
  }));
  await cancelFollowUps({
    task: changed.task,
    kinds: ["ACCESS_REQUEST", "ACCESS_CHASE"],
    version,
    reason: "Authorized access decision recorded with explicit evidence.",
  });
  const progressed = await progressCoordination({ organization, event, visitorId });
  return {
    status: decision === "APPROVED" ? "access_approval_recorded" : "access_denial_recorded",
    task: progressed,
    decision_recorded_from_external_authority: true,
    physical_access_authority_created: false,
    physical_access_granted_by_secretary: false,
    external_authority_used: false,
  };
}

export async function refreshSecretaryVisitorCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const event = await resolveEvent(organization, payload.calendar_event_id || payload.calendarEventId, { allowCancelled: true, allowEnded: true });
  const visitorId = visitorPartyId(payload, event);
  const current = await loadTask(organization, event.id, visitorId);
  if (!current) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");
  const metadata = object(current.metadata);
  if (event.status === "CANCELLED") {
    await cancelFollowUps({ task: current, reason: "Calendar event was cancelled; visitor coordination follow-ups fenced." });
    const cancelled = await mutateTask(organization, event.id, visitorId, async (_task, currentMetadata) => ({
      metadata: {
        ...currentMetadata,
        coordination_state: "CANCELLED",
        calendar_event_cancelled_detected: true,
        cancelled_at: new Date().toISOString(),
        physical_access_authority_created: false,
        physical_access_granted_by_secretary: false,
        external_authority_used: false,
      },
      task_patch: { status: "CANCELLED" },
    }));
    return { status: "calendar_event_cancelled_fenced", task: cancelled.task, external_authority_used: false };
  }
  const previousSnapshot = object(metadata.schedule_snapshot);
  const nextSnapshot = eventSnapshot(event);
  if (sameSnapshot(previousSnapshot, nextSnapshot)) {
    const progressed = await progressCoordination({ organization, event, visitorId });
    return { status: "no_schedule_change", task: progressed, schedule_changed: false, external_authority_used: false };
  }
  const oldVersion = Number(metadata.instruction_version || 1);
  await cancelFollowUps({ task: current, version: oldVersion, reason: "Visit schedule changed; stale coordination messages fenced before re-confirmation." });
  const now = new Date().toISOString();
  const changed = await mutateTask(organization, event.id, visitorId, async (_task, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      coordination_state: "COORDINATING",
      instruction_version: oldVersion + 1,
      schedule_history: [...list(currentMetadata.schedule_history), {
        version: oldVersion,
        snapshot: object(currentMetadata.schedule_snapshot),
        superseded_at: now,
      }].slice(-20),
      schedule_snapshot: nextSnapshot,
      schedule_changed_requires_reconfirmation: true,
      host_confirmation_status: "PENDING",
      host_confirmation_evidence_id: null,
      host_confirmed_at: null,
      visitor_confirmation_status: "PENDING",
      visitor_confirmation_evidence_id: null,
      visitor_confirmed_at: null,
      access_status: currentMetadata.access_required === true ? "PENDING" : "NOT_REQUIRED",
      access_requested_at: null,
      access_decision_evidence_id: null,
      access_decision_by_party_id: null,
      access_decision_at: null,
      access_follow_up_ids: [],
      reception_notification_status: "NOT_QUEUED",
      arrival_instruction_status: "NOT_QUEUED",
      arrival_distribution_queued_at: null,
      visitor_acknowledgement_status: "PENDING",
      visitor_acknowledgement_evidence_id: null,
      operational_follow_up_ids: [],
      arrival_status: "EXPECTED",
      physical_access_authority_created: false,
      physical_access_granted_by_secretary: false,
      arrival_not_inferred: true,
      external_authority_used: false,
    },
    task_patch: { status: "IN_PROGRESS", due_at: event.starts_at, remind_at: chaseAt(event) || null },
  }));
  const progressed = await progressCoordination({ organization, event, visitorId });
  return {
    status: "schedule_change_recoordinated",
    task: progressed,
    schedule_changed: true,
    stale_pending_follow_ups_fenced: true,
    confirmations_reset: true,
    access_reapproval_required: object(changed.task.metadata).access_required === true,
    physical_access_granted_by_secretary: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryVisitorArrivalInstructionAcknowledgement({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const event = await resolveEvent(organization, payload.calendar_event_id || payload.calendarEventId, { allowEnded: true });
  const visitorId = visitorPartyId(payload, event);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  if (!evidenceId) throw new Error("SECRETARY_VISITOR_COORDINATION_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED");
  if (payload.acknowledged !== true) throw new Error("SECRETARY_VISITOR_COORDINATION_ACKNOWLEDGED_TRUE_REQUIRED");
  const current = await loadTask(organization, event.id, visitorId);
  if (!current) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");
  const metadata = object(current.metadata);
  if (metadata.arrival_instruction_status !== "QUEUED") throw new Error("SECRETARY_VISITOR_COORDINATION_ARRIVAL_INSTRUCTIONS_NOT_QUEUED");
  if (metadata.visitor_acknowledgement_evidence_id === evidenceId && metadata.visitor_acknowledgement_status === "ACKNOWLEDGED") {
    return { status: "acknowledgement_already_recorded", task: current, idempotent: true, arrival_not_inferred: true, external_authority_used: false };
  }
  const version = Number(metadata.instruction_version || 1);
  const changed = await mutateTask(organization, event.id, visitorId, async (_task, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      visitor_acknowledgement_status: "ACKNOWLEDGED",
      visitor_acknowledgement_evidence_id: evidenceId,
      visitor_acknowledged_at: new Date().toISOString(),
      arrival_not_inferred: true,
      physical_access_granted_by_secretary: false,
      external_authority_used: false,
    },
  }));
  await cancelFollowUps({
    task: changed.task,
    kinds: ["ARRIVAL_RECEIPT_CHASE"],
    version,
    reason: "Arrival-instruction receipt explicitly acknowledged with evidence.",
  });
  return {
    status: "acknowledgement_recorded",
    task: changed.task,
    acknowledgement_is_not_arrival: true,
    acknowledgement_is_not_access_grant: true,
    arrival_not_inferred: true,
    physical_access_granted_by_secretary: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryVisitorArrivalEvidence({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const event = await resolveEvent(organization, payload.calendar_event_id || payload.calendarEventId, { allowEnded: true, allowCancelled: true });
  const visitorId = visitorPartyId(payload, event);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  if (!evidenceId) throw new Error("SECRETARY_VISITOR_COORDINATION_ARRIVAL_EVIDENCE_REQUIRED");
  const state = text(payload.state, 60).toUpperCase();
  if (!["ARRIVED_AT_RECEPTION", "DEPARTED", "NO_SHOW_REPORTED"].includes(state)) throw new Error("SECRETARY_VISITOR_COORDINATION_ARRIVAL_STATE_INVALID");
  const recordedBy = text(payload.recorded_by_party_id || payload.recordedByPartyId, 120);
  if (!recordedBy) throw new Error("SECRETARY_VISITOR_COORDINATION_ARRIVAL_RECORDED_BY_REQUIRED");
  const current = await loadTask(organization, event.id, visitorId);
  if (!current) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");
  const metadata = object(current.metadata);
  const duplicate = list(metadata.arrival_evidence_history).find((row) => row?.evidence_id === evidenceId);
  if (duplicate) return { status: "arrival_evidence_already_recorded", task: current, idempotent: true, physical_access_granted_by_secretary: false, external_authority_used: false };
  const now = new Date().toISOString();
  const terminal = state === "DEPARTED" || state === "NO_SHOW_REPORTED";
  const changed = await mutateTask(organization, event.id, visitorId, async (_task, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      coordination_state: state === "DEPARTED" ? "COMPLETED" : state === "NO_SHOW_REPORTED" ? "NO_SHOW" : currentMetadata.coordination_state,
      arrival_status: state,
      arrival_evidence_history: [...list(currentMetadata.arrival_evidence_history), {
        state,
        evidence_id: evidenceId,
        recorded_by_party_id: recordedBy,
        recorded_at: now,
      }].slice(-30),
      arrival_not_inferred: true,
      physical_access_authority_created: false,
      physical_access_granted_by_secretary: false,
      external_authority_used: false,
    },
    task_patch: terminal ? { status: "DONE", completed_at: now } : {},
  }));
  if (terminal) await cancelFollowUps({ task: changed.task, reason: `Visitor coordination terminal arrival state recorded: ${state}.` });
  return {
    status: "arrival_evidence_recorded",
    task: changed.task,
    arrival_state: state,
    admission_not_inferred: true,
    physical_access_granted_by_secretary: false,
    external_authority_used: false,
  };
}

export async function cancelSecretaryVisitorCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const event = await resolveEvent(organization, payload.calendar_event_id || payload.calendarEventId, { allowCancelled: true, allowEnded: true });
  const visitorId = visitorPartyId(payload, event);
  const current = await loadTask(organization, event.id, visitorId);
  if (!current) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");
  if (object(current.metadata).coordination_state === "CANCELLED") {
    return { status: "already_cancelled", task: current, calendar_event_cancelled: false, external_authority_used: false };
  }
  const reason = text(payload.reason, 1000) || "Visitor coordination cancelled.";
  await cancelFollowUps({ task: current, reason });
  const now = new Date().toISOString();
  const cancelled = await mutateTask(organization, event.id, visitorId, async (_task, metadata) => ({
    metadata: {
      ...metadata,
      coordination_state: "CANCELLED",
      cancelled_at: now,
      cancellation_reason: reason,
      physical_access_authority_created: false,
      physical_access_granted_by_secretary: false,
      external_authority_used: false,
    },
    task_patch: { status: "CANCELLED", completed_at: now },
  }));
  return {
    status: "cancelled",
    task: cancelled.task,
    calendar_event_cancelled: false,
    physical_access_authority_created: false,
    physical_access_granted_by_secretary: false,
    external_authority_used: false,
  };
}

export async function readSecretaryVisitorCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const event = await resolveEvent(organization, payload.calendar_event_id || payload.calendarEventId, { allowCancelled: true, allowEnded: true });
  const visitorId = visitorPartyId(payload, event);
  const task = await loadTask(organization, event.id, visitorId);
  if (!task) throw new Error("SECRETARY_VISITOR_COORDINATION_NOT_FOUND");
  const metadata = object(task.metadata);
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,contact_party_id,due_at,result,metadata")
      .eq("organization_id", organization)
      .eq("task_id", task.id)
      .order("created_at", { ascending: true })
      .limit(500),
  );
  return {
    status: "read",
    contract: CONTRACT,
    task,
    calendar_event: event,
    visitor: {
      party_id: metadata.visitor_party_id,
      confirmation_status: metadata.visitor_confirmation_status,
      acknowledgement_status: metadata.visitor_acknowledgement_status,
      arrival_status: metadata.arrival_status,
    },
    host: { party_id: metadata.host_party_id, confirmation_status: metadata.host_confirmation_status },
    access: {
      required: metadata.access_required === true,
      status: metadata.access_status,
      security_party_id: metadata.security_party_id || null,
      decision_evidence_id: metadata.access_decision_evidence_id || null,
      physical_access_authority_created: false,
      physical_access_granted_by_secretary: false,
    },
    reception_notification_status: metadata.reception_notification_status,
    arrival_instruction_status: metadata.arrival_instruction_status,
    instruction_version: Number(metadata.instruction_version || 1),
    schedule_changed: !sameSnapshot(object(metadata.schedule_snapshot), eventSnapshot(event)),
    schedule_history: list(metadata.schedule_history),
    follow_ups: followUps,
    arrival_not_inferred: true,
    physical_access_authority_created: false,
    physical_access_granted_by_secretary: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  start: startSecretaryVisitorCoordination,
  read: readSecretaryVisitorCoordination,
  hostResponse: recordSecretaryVisitorHostResponse,
  visitorResponse: recordSecretaryVisitorResponse,
  accessDecision: recordSecretaryVisitorAccessDecision,
  refresh: refreshSecretaryVisitorCoordination,
  acknowledge: recordSecretaryVisitorArrivalInstructionAcknowledgement,
  arrival: recordSecretaryVisitorArrivalEvidence,
  cancel: cancelSecretaryVisitorCoordination,
});
