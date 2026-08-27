import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_EVENT_GUEST_COORDINATION_V1";
const SOURCE = "secretary_event_guest_coordination";
const REGISTER_KEY = "event_guest_coordination_v1";
const ACTIVE_STATES = new Set(["OPEN", "FINALIZED"]);
const RESPONSE_STATES = new Set(["PENDING", "ACCEPTED", "DECLINED", "MAYBE"]);
const INVITATION_STATES = new Set(["REQUESTED", "SENT", "FAILED", "SKIPPED"]);
const CHANNELS = new Set(["EMAIL", "MESSAGE", "CALL"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
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

function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_EVENT_GUEST_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_EVENT_GUEST_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function payloadHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safetyFlags() {
  return {
    attendance_inferred: false,
    invitation_delivery_inferred: false,
    physical_access_granted_by_secretary: false,
    calendar_event_created: false,
    calendar_event_modified: false,
    resource_reserved: false,
    room_setup_performed: false,
    catering_ordered: false,
    vendor_commitment_created: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_booking_performed: false,
    external_authority_used: false,
  };
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

async function routingFor({ context, instruction, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "TASK_ROUTING",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_EVENT_GUEST_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_EVENT_GUEST_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function ensureParty(organization, partyId, field = "guest") {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_EVENT_GUEST_${field.toUpperCase()}_PARTY_REQUIRED`);
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,email,phone,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error(`SECRETARY_EVENT_GUEST_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return party;
}

async function preferredChannel(organization, partyId, requested = null) {
  const explicit = text(requested, 40).toUpperCase();
  if (explicit) {
    if (!CHANNELS.has(explicit)) throw new Error("SECRETARY_EVENT_GUEST_CHANNEL_INVALID");
    return explicit;
  }
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
  return "MESSAGE";
}

async function resolveCalendarEvent(organization, calendarEventId) {
  const id = text(calendarEventId, 120);
  if (!id) return null;
  const event = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("id,title,description,event_type,status,starts_at,ends_at,timezone,location")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!event) throw new Error("SECRETARY_EVENT_GUEST_CALENDAR_EVENT_NOT_FOUND");
  if (event.status === "CANCELLED") throw new Error("SECRETARY_EVENT_GUEST_CALENDAR_EVENT_CANCELLED");
  return event;
}

function invitationFollowUpId(taskId, partyId, kind, sequence) {
  return deterministicUuid(`avantiqo-secretary-event-guest-follow-up-v1:${taskId}:${partyId}:${kind}:${sequence}`);
}

function invitationInstruction(register, guest) {
  return [
    `Invite ${guest.display_name || "the guest"} to \"${register.title}\".`,
    `Event time: ${register.starts_at} to ${register.ends_at} (${register.timezone}).`,
    register.location ? `Location: ${register.location}.` : null,
    guest.role ? `Guest role: ${guest.role}.` : null,
    "Ask for an explicit RSVP: ACCEPTED, DECLINED, or MAYBE.",
    "Do not imply that an invitation grants physical access, security clearance, parking, payment, travel, accommodation, or any other external entitlement.",
  ].filter(Boolean).join(" ");
}

function reminderInstruction(register, guest) {
  return [
    `Politely follow up with ${guest.display_name || "the guest"} about the invitation to \"${register.title}\".`,
    `Event time: ${register.starts_at} to ${register.ends_at} (${register.timezone}).`,
    "Ask only for an explicit RSVP: ACCEPTED, DECLINED, or MAYBE.",
    "Do not infer attendance from silence and do not grant physical access or make any external commitment.",
  ].join(" ");
}

async function ensureFollowUp({ task, register, guest, kind, sequence, dueAt, instruction }) {
  const id = invitationFollowUpId(task.id, guest.party_id, kind, sequence);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  return one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      id,
      organization_id: task.organization_id,
      entity_id: task.entity_id,
      owner_party_id: register.operational_assignee_party_id || task.owner_party_id,
      contact_party_id: guest.party_id,
      task_id: task.id,
      calendar_event_id: register.calendar_event_id || null,
      action_type: guest.action_type,
      reason: instruction,
      status: "PENDING",
      due_at: dueAt,
      created_by_party_id: task.created_by_party_id,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: true,
        execution_instruction: instruction,
        secretary_owned: true,
        secretary_event_guest_coordination: true,
        secretary_event_guest_coordination_contract: CONTRACT,
        event_guest_coordination_task_id: task.id,
        event_guest_party_id: guest.party_id,
        event_guest_follow_up_kind: kind,
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
}

async function cancelGuestFollowUps(task, partyId, reason) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("contact_party_id", partyId)
      .eq("status", "PENDING")
      .limit(500),
  );
  const ids = rows
    .filter((row) => object(row.metadata).secretary_event_guest_coordination_contract === CONTRACT)
    .map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids;
}

async function cancelAllFollowUps(task, reason) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const ids = rows
    .filter((row) => object(row.metadata).secretary_event_guest_coordination_contract === CONTRACT)
    .map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids;
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_EVENT_GUEST_RECORD_INVALID");
  return {
    ...register,
    guests: list(register.guests),
    history: list(register.history),
  };
}

async function readTask({ organization, coordinationId }) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", coordinationId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_EVENT_GUEST_NOT_FOUND");
  return task;
}

function coordinationIdFor({ organization, title, startsAt, evidenceId }) {
  return deterministicUuid(`avantiqo-secretary-event-guest-v1:${organization}:${title}:${startsAt}:${evidenceId}`);
}

function eventHistory({ event, evidenceId, at, actor, version, hash, details = {} }) {
  return {
    event,
    evidence_id: evidenceId,
    occurred_at: at,
    recorded_by_party_id: actor,
    version,
    payload_sha256: hash,
    ...object(details),
    ...safetyFlags(),
  };
}

function guestCounts(register) {
  const counts = { total: 0, pending: 0, accepted: 0, declined: 0, maybe: 0 };
  for (const guest of list(register.guests)) {
    counts.total += 1;
    const state = text(guest.response_status, 40).toUpperCase();
    if (state === "ACCEPTED") counts.accepted += 1;
    else if (state === "DECLINED") counts.declined += 1;
    else if (state === "MAYBE") counts.maybe += 1;
    else counts.pending += 1;
  }
  return counts;
}

async function ensureInitialInvitations(task, register) {
  const rows = [];
  for (const guest of register.guests) {
    rows.push(await ensureFollowUp({
      task,
      register,
      guest,
      kind: "INVITATION",
      sequence: 1,
      dueAt: register.invitation_due_at || register.started_at,
      instruction: invitationInstruction(register, guest),
    }));
  }
  return rows;
}

async function mutation({ context, payload, instruction, eventName, allowedStates, producer }) {
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_EVENT_GUEST_COORDINATION_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_EVENT_GUEST_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_EVENT_GUEST_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = payloadHash(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask({ organization: auth.organization, coordinationId });
    const register = registerFromTask(task);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) {
      if (replay.event === eventName && replay.payload_sha256 === hash) {
        return { status: "completed", contract: CONTRACT, coordination: task, record: register, replay_safe: true, ...safetyFlags() };
      }
      throw new Error("SECRETARY_EVENT_GUEST_EVIDENCE_REUSE_CONFLICT");
    }
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_EVENT_GUEST_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_EVENT_GUEST_STALE_VERSION");

    const produced = await producer({ task, register, auth, occurredAt, evidenceId, hash });
    const nextVersion = expectedVersion + 1;
    const next = {
      ...register,
      ...object(produced.patch),
      contract: CONTRACT,
      version: nextVersion,
      history: [...register.history, eventHistory({
        event: eventName,
        evidenceId,
        at: occurredAt,
        actor: auth.actor,
        version: nextVersion,
        hash,
        details: produced.historyDetails,
      })].slice(-500),
      ...safetyFlags(),
    };
    const terminal = next.state === "CANCELLED";
    const update = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: terminal ? "CANCELLED" : "IN_PROGRESS",
        completed_at: terminal ? occurredAt : null,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_event_guest_coordination_contract: CONTRACT,
          secretary_event_guest_coordination_state: next.state,
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

    if (produced.cancelGuestPartyId) await cancelGuestFollowUps(update.data, produced.cancelGuestPartyId, produced.cancelReason || "Guest response recorded.");
    if (produced.cancelAll === true) await cancelAllFollowUps(update.data, produced.cancelReason || "Event guest coordination closed.");
    if (produced.followUp) {
      await ensureFollowUp({
        task: update.data,
        register: next,
        guest: produced.followUp.guest,
        kind: produced.followUp.kind,
        sequence: produced.followUp.sequence,
        dueAt: produced.followUp.dueAt,
        instruction: produced.followUp.instruction,
      });
    }

    return { status: "completed", contract: CONTRACT, coordination: update.data, record: next, replay_safe: false, ...safetyFlags() };
  }
  throw new Error("SECRETARY_EVENT_GUEST_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryEventGuestCoordination({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_EVENT_GUEST_EVIDENCE_REQUIRED");
  const startedAt = iso(payload.started_at || payload.startedAt, "started_at");
  const auth = await routingFor({ context, instruction: "Coordinate event guest invitations and RSVPs.", at: startedAt });
  const calendarEvent = await resolveCalendarEvent(auth.organization, payload.calendar_event_id || payload.calendarEventId);
  const title = text(calendarEvent?.title || payload.title, 600);
  if (!title) throw new Error("SECRETARY_EVENT_GUEST_TITLE_REQUIRED");
  const startsAt = iso(calendarEvent?.starts_at || payload.starts_at || payload.startsAt, "starts_at");
  const endsAt = iso(calendarEvent?.ends_at || payload.ends_at || payload.endsAt, "ends_at");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_EVENT_GUEST_WINDOW_INVALID");
  const timezone = text(calendarEvent?.timezone || payload.timezone || context.timezone, 120) || "UTC";
  const location = text(calendarEvent?.location || payload.location, 1000) || null;
  const invitationDueAt = iso(payload.invitation_due_at || payload.invitationDueAt || startedAt, "invitation_due_at");
  const guestInputs = list(payload.guests).slice(0, 100);
  if (!guestInputs.length) throw new Error("SECRETARY_EVENT_GUEST_GUESTS_REQUIRED");

  const ids = guestInputs.map((row) => text(object(row).party_id || object(row).partyId, 120));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error("SECRETARY_EVENT_GUEST_GUESTS_INVALID");
  const guests = [];
  for (const row of guestInputs) {
    const item = object(row);
    const party = await ensureParty(auth.organization, item.party_id || item.partyId);
    guests.push({
      party_id: party.id,
      display_name: text(party.display_name || party.legal_name, 500) || null,
      role: text(item.role, 300) || null,
      note: text(item.note, 1200) || null,
      response_required: item.response_required !== false && item.responseRequired !== false,
      action_type: await preferredChannel(auth.organization, party.id, item.action_type || item.actionType),
      invitation_status: "REQUESTED",
      invitation_evidence_id: null,
      invitation_recorded_at: null,
      response_status: "PENDING",
      response_note: null,
      response_evidence_id: null,
      response_recorded_at: null,
      reminder_count: 0,
      invitation_follow_up_id: null,
      last_reminder_follow_up_id: null,
    });
  }

  const coordinationId = coordinationIdFor({ organization: auth.organization, title, startsAt, evidenceId });
  const startPayload = {
    coordination_id: coordinationId,
    calendar_event_id: calendarEvent?.id || null,
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    location,
    invitation_due_at: invitationDueAt,
    guests: guests.map((guest) => ({ party_id: guest.party_id, role: guest.role, response_required: guest.response_required, action_type: guest.action_type })),
    evidence_id: evidenceId,
    started_at: startedAt,
  };
  const hash = payloadHash(startPayload);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", auth.organization)
      .eq("id", coordinationId)
      .maybeSingle(),
  );
  if (existing) {
    const register = registerFromTask(existing);
    const first = register.history[0];
    if (first?.event === "EVENT_GUEST_COORDINATION_STARTED" && first?.evidence_id === evidenceId && first?.payload_sha256 === hash) {
      await ensureInitialInvitations(existing, register);
      return { status: "open", contract: CONTRACT, coordination: existing, record: register, replay_safe: true, counts: guestCounts(register), ...safetyFlags() };
    }
    throw new Error("SECRETARY_EVENT_GUEST_EVIDENCE_REUSE_CONFLICT");
  }

  const register = {
    contract: CONTRACT,
    coordination_id: coordinationId,
    state: "OPEN",
    version: 1,
    calendar_event_id: calendarEvent?.id || null,
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    location,
    invitation_due_at: invitationDueAt,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    guests: guests.map((guest) => ({
      ...guest,
      invitation_follow_up_id: invitationFollowUpId(coordinationId, guest.party_id, "INVITATION", 1),
    })),
    started_at: startedAt,
    finalized_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    history: [eventHistory({
      event: "EVENT_GUEST_COORDINATION_STARTED",
      evidenceId,
      at: startedAt,
      actor: auth.actor,
      version: 1,
      hash,
      details: { guest_count: guests.length, calendar_event_id: calendarEvent?.id || null },
    })],
    ...safetyFlags(),
  };

  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: coordinationId,
      organization_id: auth.organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: auth.operational,
      contact_party_id: null,
      calendar_event_id: calendarEvent?.id || null,
      title: `Event guest coordination: ${title}`,
      details: "Coordinate invitations, explicit RSVP evidence, reminders, and final guest list. This does not grant access or alter the calendar event.",
      status: "IN_PROGRESS",
      priority: "NORMAL",
      due_at: startsAt,
      remind_at: null,
      completed_at: null,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_event_guest_coordination_contract: CONTRACT,
        secretary_event_guest_coordination_state: "OPEN",
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
  await ensureInitialInvitations(task, register);
  return { status: "open", contract: CONTRACT, coordination: task, record: register, replay_safe: false, counts: guestCounts(register), ...safetyFlags() };
}

export async function addSecretaryEventGuest({ context, payload = {} } = {}) {
  const partyId = text(payload.party_id || payload.partyId, 120);
  const organization = organizationId(context);
  const party = await ensureParty(organization, partyId);
  const actionType = await preferredChannel(organization, party.id, payload.action_type || payload.actionType);
  return mutation({
    context,
    payload,
    instruction: `Add ${text(party.display_name || party.legal_name, 500) || "a guest"} to an event guest list.`,
    eventName: "EVENT_GUEST_ADDED",
    allowedStates: new Set(["OPEN"]),
    producer: async ({ task, register, occurredAt }) => {
      if (register.guests.some((guest) => guest.party_id === party.id)) throw new Error("SECRETARY_EVENT_GUEST_ALREADY_LISTED");
      const sequence = Number(register.version) + 1;
      const guest = {
        party_id: party.id,
        display_name: text(party.display_name || party.legal_name, 500) || null,
        role: text(payload.role, 300) || null,
        note: text(payload.note, 1200) || null,
        response_required: payload.response_required !== false && payload.responseRequired !== false,
        action_type: actionType,
        invitation_status: "REQUESTED",
        invitation_evidence_id: null,
        invitation_recorded_at: null,
        response_status: "PENDING",
        response_note: null,
        response_evidence_id: null,
        response_recorded_at: null,
        reminder_count: 0,
        invitation_follow_up_id: invitationFollowUpId(task.id, party.id, "INVITATION", sequence),
        last_reminder_follow_up_id: null,
      };
      return {
        patch: { guests: [...register.guests, guest] },
        historyDetails: { party_id: party.id },
        followUp: {
          guest,
          kind: "INVITATION",
          sequence,
          dueAt: occurredAt,
          instruction: invitationInstruction(register, guest),
        },
      };
    },
  });
}

export async function recordSecretaryEventGuestInvitation({ context, payload = {} } = {}) {
  const status = text(payload.invitation_status || payload.invitationStatus, 40).toUpperCase();
  if (!INVITATION_STATES.has(status) || status === "REQUESTED") throw new Error("SECRETARY_EVENT_GUEST_INVITATION_STATUS_INVALID");
  const partyId = text(payload.party_id || payload.partyId, 120);
  if (!partyId) throw new Error("SECRETARY_EVENT_GUEST_PARTY_REQUIRED");
  return mutation({
    context,
    payload,
    instruction: "Record explicit event invitation delivery evidence.",
    eventName: "EVENT_GUEST_INVITATION_RECORDED",
    allowedStates: new Set(["OPEN"]),
    producer: async ({ register, occurredAt, evidenceId }) => {
      let found = false;
      const guests = register.guests.map((guest) => {
        if (guest.party_id !== partyId) return guest;
        found = true;
        return {
          ...guest,
          invitation_status: status,
          invitation_evidence_id: evidenceId,
          invitation_recorded_at: occurredAt,
        };
      });
      if (!found) throw new Error("SECRETARY_EVENT_GUEST_PARTY_NOT_LISTED");
      return { patch: { guests }, historyDetails: { party_id: partyId, invitation_status: status } };
    },
  });
}

export async function recordSecretaryEventGuestResponse({ context, payload = {} } = {}) {
  const response = text(payload.response_status || payload.responseStatus, 40).toUpperCase();
  if (!RESPONSE_STATES.has(response) || response === "PENDING") throw new Error("SECRETARY_EVENT_GUEST_RESPONSE_STATUS_INVALID");
  const partyId = text(payload.party_id || payload.partyId, 120);
  if (!partyId) throw new Error("SECRETARY_EVENT_GUEST_PARTY_REQUIRED");
  return mutation({
    context,
    payload,
    instruction: "Record explicit event RSVP evidence.",
    eventName: "EVENT_GUEST_RESPONSE_RECORDED",
    allowedStates: new Set(["OPEN"]),
    producer: async ({ register, occurredAt, evidenceId }) => {
      let found = false;
      const guests = register.guests.map((guest) => {
        if (guest.party_id !== partyId) return guest;
        found = true;
        return {
          ...guest,
          response_status: response,
          response_note: text(payload.note, 1600) || null,
          response_evidence_id: evidenceId,
          response_recorded_at: occurredAt,
        };
      });
      if (!found) throw new Error("SECRETARY_EVENT_GUEST_PARTY_NOT_LISTED");
      return {
        patch: { guests },
        historyDetails: { party_id: partyId, response_status: response },
        cancelGuestPartyId: partyId,
        cancelReason: "Explicit RSVP recorded; pending invitation/reminder follow-ups are no longer needed.",
      };
    },
  });
}

export async function remindSecretaryEventGuest({ context, payload = {} } = {}) {
  const partyId = text(payload.party_id || payload.partyId, 120);
  if (!partyId) throw new Error("SECRETARY_EVENT_GUEST_PARTY_REQUIRED");
  const dueAt = iso(payload.due_at || payload.dueAt || payload.occurred_at || payload.occurredAt, "due_at");
  return mutation({
    context,
    payload,
    instruction: "Schedule an RSVP reminder for an event guest.",
    eventName: "EVENT_GUEST_REMINDER_REQUESTED",
    allowedStates: new Set(["OPEN"]),
    producer: async ({ task, register }) => {
      const index = register.guests.findIndex((guest) => guest.party_id === partyId);
      if (index < 0) throw new Error("SECRETARY_EVENT_GUEST_PARTY_NOT_LISTED");
      const guest = register.guests[index];
      if (!new Set(["PENDING", "MAYBE"]).has(guest.response_status)) throw new Error("SECRETARY_EVENT_GUEST_REMINDER_NOT_NEEDED");
      const sequence = Number(guest.reminder_count || 0) + 1;
      const followUpId = invitationFollowUpId(task.id, partyId, "RSVP_REMINDER", sequence);
      const guests = register.guests.map((row, rowIndex) => rowIndex === index ? {
        ...row,
        reminder_count: sequence,
        last_reminder_follow_up_id: followUpId,
      } : row);
      return {
        patch: { guests },
        historyDetails: { party_id: partyId, reminder_sequence: sequence, due_at: dueAt },
        followUp: {
          guest: { ...guest, reminder_count: sequence },
          kind: "RSVP_REMINDER",
          sequence,
          dueAt,
          instruction: reminderInstruction(register, guest),
        },
      };
    },
  });
}

export async function finalizeSecretaryEventGuestList({ context, payload = {} } = {}) {
  return mutation({
    context,
    payload,
    instruction: "Finalize the event guest list from explicit RSVP evidence.",
    eventName: "EVENT_GUEST_LIST_FINALIZED",
    allowedStates: new Set(["OPEN"]),
    producer: async ({ register, occurredAt }) => {
      const unresolved = register.guests.filter((guest) => guest.response_required !== false && ["PENDING", "MAYBE"].includes(guest.response_status));
      if (unresolved.length) throw new Error("SECRETARY_EVENT_GUEST_REQUIRED_RESPONSES_PENDING");
      return {
        patch: { state: "FINALIZED", finalized_at: occurredAt, finalized_counts: guestCounts(register) },
        historyDetails: { counts: guestCounts(register) },
        cancelAll: true,
        cancelReason: "Event guest list finalized from explicit RSVP evidence.",
      };
    },
  });
}

export async function reopenSecretaryEventGuestList({ context, payload = {} } = {}) {
  return mutation({
    context,
    payload,
    instruction: "Reopen a finalized event guest list for explicit revision.",
    eventName: "EVENT_GUEST_LIST_REOPENED",
    allowedStates: new Set(["FINALIZED"]),
    producer: async () => ({ patch: { state: "OPEN", finalized_at: null, finalized_counts: null } }),
  });
}

export async function cancelSecretaryEventGuestCoordination({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1600);
  if (!reason) throw new Error("SECRETARY_EVENT_GUEST_CANCEL_REASON_REQUIRED");
  return mutation({
    context,
    payload,
    instruction: "Cancel event guest coordination only.",
    eventName: "EVENT_GUEST_COORDINATION_CANCELLED",
    allowedStates: ACTIVE_STATES,
    producer: async ({ occurredAt }) => ({
      patch: { state: "CANCELLED", cancelled_at: occurredAt, cancellation_reason: reason },
      historyDetails: { reason },
      cancelAll: true,
      cancelReason: reason,
    }),
  });
}

export async function readSecretaryEventGuestCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_EVENT_GUEST_COORDINATION_ID_REQUIRED");
  const task = await readTask({ organization, coordinationId });
  const register = registerFromTask(task);
  return { status: "completed", contract: CONTRACT, coordination: task, record: register, counts: guestCounts(register), ...safetyFlags() };
}

export async function listSecretaryEventGuestCoordinations({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const includeCancelled = payload.include_cancelled === true || payload.includeCancelled === true;
  const limit = Math.max(1, Math.min(Number(payload.limit) || 50, 200));
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeCancelled) query = query.neq("status", "CANCELLED");
  const tasks = await many(query);
  return {
    status: "completed",
    contract: CONTRACT,
    coordinations: tasks.map((task) => {
      const record = registerFromTask(task);
      return { coordination: task, record, counts: guestCounts(record) };
    }),
    ...safetyFlags(),
  };
}

export default Object.freeze({
  start: startSecretaryEventGuestCoordination,
  addGuest: addSecretaryEventGuest,
  recordInvitation: recordSecretaryEventGuestInvitation,
  recordResponse: recordSecretaryEventGuestResponse,
  remind: remindSecretaryEventGuest,
  finalize: finalizeSecretaryEventGuestList,
  reopen: reopenSecretaryEventGuestList,
  cancel: cancelSecretaryEventGuestCoordination,
  read: readSecretaryEventGuestCoordination,
  list: listSecretaryEventGuestCoordinations,
});
