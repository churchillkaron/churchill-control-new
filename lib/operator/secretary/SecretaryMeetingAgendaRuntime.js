import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_AGENDA_V1";
const AGENDA_KIND = "MEETING_AGENDA";

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
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function agendaTaskId(organization, calendarEventId) {
  return deterministicUuid(`avantiqo-secretary-meeting-agenda-v1:${organization}:${calendarEventId}`);
}

function followUpId(taskId, partyId, kind, version = 0) {
  return deterministicUuid(`avantiqo-secretary-meeting-agenda-follow-up-v1:${taskId}:${partyId}:${kind}:${version}`);
}

function parseIso(value, field, { required = false } = {}) {
  const raw = text(value, 160);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_MEETING_AGENDA_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new Error(`SECRETARY_MEETING_AGENDA_${field.toUpperCase()}_INVALID`);
  return new Date(ms).toISOString();
}

function normalizeActionType(value) {
  const action = text(value, 40).toUpperCase();
  return action === "EMAIL" ? "EMAIL" : "MESSAGE";
}

function normalizeItems(value, source = {}) {
  return list(value).slice(0, 40).map((item, index) => {
    const row = typeof item === "string" ? { title: item } : object(item);
    const title = text(row.title || row.item || row.topic, 500);
    if (!title) throw new Error(`SECRETARY_MEETING_AGENDA_ITEM_TITLE_REQUIRED:${index}`);
    return {
      id: text(row.id, 120) || deterministicUuid(`agenda-item:${source.seed || "manual"}:${index}:${title}`),
      title,
      details: text(row.details || row.description, 2000) || null,
      owner_party_id: text(row.owner_party_id || row.ownerPartyId, 120) || null,
      source_kind: text(row.source_kind || source.kind, 80).toUpperCase() || "SECRETARY",
      source_party_id: text(row.source_party_id || source.partyId, 120) || null,
      evidence_id: text(row.evidence_id || source.evidenceId, 200) || null,
      added_at: text(row.added_at, 160) || new Date().toISOString(),
    };
  });
}

function normalizeReferences(value) {
  return list(value).slice(0, 20).map((item, index) => {
    const row = typeof item === "string" ? { reference: item } : object(item);
    const reference = text(row.reference || row.url || row.path || row.document_id || row.documentId, 1200);
    if (!reference) throw new Error(`SECRETARY_MEETING_AGENDA_PRE_READ_REFERENCE_REQUIRED:${index}`);
    return {
      label: text(row.label || row.title, 300) || `Pre-read ${index + 1}`,
      reference,
      source_kind: text(row.source_kind, 80).toUpperCase() || "EXPLICIT_REFERENCE",
    };
  });
}

async function resolveCalendarEvent(organization, calendarEventId) {
  const eventId = text(calendarEventId, 120);
  if (!eventId) throw new Error("SECRETARY_MEETING_AGENDA_CALENDAR_EVENT_REQUIRED");
  const event = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", eventId)
      .maybeSingle(),
  );
  if (!event) throw new Error("SECRETARY_MEETING_AGENDA_CALENDAR_EVENT_NOT_FOUND");
  if (event.status === "CANCELLED") throw new Error("SECRETARY_MEETING_AGENDA_CALENDAR_EVENT_CANCELLED");
  if (Date.parse(event.ends_at) <= Date.now()) throw new Error("SECRETARY_MEETING_AGENDA_MEETING_ALREADY_ENDED");
  return event;
}

async function participantProfiles(organization, partyIds) {
  const ids = [...new Set(partyIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await many(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("party_id,preferred_channel")
      .eq("organization_id", organization)
      .in("party_id", ids),
  );
  return new Map(rows.map((row) => [row.party_id, row]));
}

function normalizeExplicitParticipants(value) {
  return list(value).slice(0, 50).map((item) => {
    const row = object(item);
    const partyId = text(row.party_id || row.partyId, 120);
    if (!partyId) throw new Error("SECRETARY_MEETING_AGENDA_PARTICIPANT_PARTY_REQUIRED");
    return {
      party_id: partyId,
      required: row.required !== false,
      action_type: normalizeActionType(row.action_type || row.actionType),
      source: "EXPLICIT",
    };
  });
}

async function resolveParticipantRoster(organization, event, explicitParticipants) {
  let rows = normalizeExplicitParticipants(explicitParticipants);

  if (!rows.length) {
    const coordination = await one(
      supabaseAdmin.from("secretary_meeting_coordinations")
        .select("id")
        .eq("organization_id", organization)
        .eq("calendar_event_id", event.id)
        .eq("status", "BOOKED")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (coordination?.id) {
      rows = (await many(
        supabaseAdmin.from("secretary_meeting_coordination_participants")
          .select("party_id,required,action_type")
          .eq("organization_id", organization)
          .eq("coordination_id", coordination.id)
          .order("created_at", { ascending: true }),
      )).map((row) => ({
        party_id: row.party_id,
        required: row.required !== false,
        action_type: normalizeActionType(row.action_type),
        source: "BOOKED_COORDINATION",
      }));
    }
  }

  if (!rows.length) {
    const occurrence = await one(
      supabaseAdmin.from("secretary_recurring_meeting_occurrences")
        .select("series_id")
        .eq("organization_id", organization)
        .eq("calendar_event_id", event.id)
        .maybeSingle(),
    );
    if (occurrence?.series_id) {
      rows = (await many(
        supabaseAdmin.from("secretary_recurring_meeting_participants")
          .select("party_id,required,action_type")
          .eq("organization_id", organization)
          .eq("series_id", occurrence.series_id)
          .order("created_at", { ascending: true }),
      )).map((row) => ({
        party_id: row.party_id,
        required: row.required !== false,
        action_type: normalizeActionType(row.action_type),
        source: "RECURRING_SERIES",
      }));
    }
  }

  if (!rows.length && event.contact_party_id) {
    rows = [{
      party_id: event.contact_party_id,
      required: true,
      action_type: "MESSAGE",
      source: "CALENDAR_CONTACT",
    }];
  }

  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row.party_id || seen.has(row.party_id) || row.party_id === event.owner_party_id) continue;
    seen.add(row.party_id);
    deduped.push(row);
  }

  const profiles = await participantProfiles(organization, deduped.map((row) => row.party_id));
  return deduped.map((row) => {
    const preferred = text(profiles.get(row.party_id)?.preferred_channel, 120).toLowerCase();
    const actionType = preferred.includes("email") ? "EMAIL" : row.action_type;
    return {
      party_id: row.party_id,
      required: row.required,
      action_type: actionType,
      roster_source: row.source,
      contribution_status: "PENDING",
      contribution_received_at: null,
      contribution_evidence_ids: [],
      distribution_status: "NOT_QUEUED",
      acknowledgement_status: "PENDING",
      acknowledged_at: null,
      acknowledgement_evidence_id: null,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
    };
  });
}

function operationalTimes(event, payload = {}) {
  const now = Date.now();
  const eventStart = Date.parse(event.starts_at);
  if (!Number.isFinite(eventStart) || eventStart <= now + 5 * 60 * 1000) {
    throw new Error("SECRETARY_MEETING_AGENDA_TOO_LATE_TO_START_COLLECTION");
  }
  let deadline = parseIso(payload.collection_deadline || payload.collectionDeadline, "collection_deadline");
  if (!deadline) {
    const remaining = eventStart - now;
    const lead = Math.min(24 * 60 * 60 * 1000, Math.max(5 * 60 * 1000, Math.floor(remaining / 2)));
    deadline = new Date(eventStart - lead).toISOString();
  }
  const deadlineMs = Date.parse(deadline);
  if (deadlineMs <= now || deadlineMs >= eventStart) throw new Error("SECRETARY_MEETING_AGENDA_COLLECTION_DEADLINE_INVALID");

  let chaseAt = parseIso(payload.chase_at || payload.chaseAt, "chase_at");
  if (!chaseAt) chaseAt = new Date(now + Math.max(60 * 1000, Math.floor((deadlineMs - now) / 2))).toISOString();
  const chaseMs = Date.parse(chaseAt);
  if (chaseMs <= now || chaseMs >= deadlineMs) throw new Error("SECRETARY_MEETING_AGENDA_CHASE_AT_INVALID");
  return { collection_deadline: deadline, chase_at: chaseAt };
}

async function loadAgendaTask(organization, calendarEventId) {
  return one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", agendaTaskId(organization, calendarEventId))
      .maybeSingle(),
  );
}

async function ensureFollowUp({ task, event, participant, kind, version = 0, dueAt, instruction }) {
  const id = followUpId(task.id, participant.party_id, kind, version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: task.owner_party_id || null,
    contact_party_id: participant.party_id,
    task_id: task.id,
    calendar_event_id: event.id,
    action_type: participant.action_type,
    reason: text(instruction, 4000),
    status: "PENDING",
    due_at: dueAt,
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: text(instruction, 4000),
      secretary_owned: true,
      secretary_meeting_agenda: true,
      secretary_meeting_agenda_task_id: task.id,
      secretary_meeting_agenda_kind: kind,
      secretary_meeting_agenda_version: version,
      participant_party_id: participant.party_id,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
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

function collectionInstruction(event, deadline, kind) {
  if (kind === "CONTRIBUTION_CHASE") {
    return [
      `Follow up once for agenda input for the meeting \"${text(event.title, 500)}\" scheduled for ${event.starts_at}.`,
      `Ask only whether they have any agenda items to add before ${deadline}.`,
      "This is agenda collection only. Do not imply RSVP, attendance, approval, agreement, or any new commitment.",
    ].join(" ");
  }
  return [
    `Ask for any agenda items they want included in the meeting \"${text(event.title, 500)}\" scheduled for ${event.starts_at}.`,
    `Please request their agenda input before ${deadline}.`,
    "This is agenda collection only. Do not imply RSVP, attendance, approval, agreement, or any new commitment.",
  ].join(" ");
}

function compactAgenda(version) {
  const lines = [];
  for (const [index, item] of list(version.items).entries()) {
    const line = `${index + 1}. ${text(item.title, 220)}${item.details ? ` — ${text(item.details, 260)}` : ""}`;
    if ((lines.join("\n").length + line.length) > 1250) break;
    lines.push(line);
  }
  const refs = list(version.pre_read_references).slice(0, 5)
    .map((row) => `${text(row.label, 100)}: ${text(row.reference, 220)}`);
  return {
    items_text: lines.join("\n"),
    pre_read_text: refs.join("\n"),
  };
}

function distributionInstruction(event, version) {
  const compact = compactAgenda(version);
  return [
    `Distribute finalized agenda version ${version.version} for \"${text(event.title, 500)}\" scheduled for ${event.starts_at}.`,
    compact.items_text ? `Agenda:\n${compact.items_text}` : null,
    compact.pre_read_text ? `Pre-read references:\n${compact.pre_read_text}` : null,
    "State that this is the meeting agenda/pre-read distribution only. Do not imply RSVP, attendance, approval, agreement, or any new commitment.",
  ].filter(Boolean).join("\n");
}

function acknowledgementInstruction(event, version) {
  return [
    `Ask the participant to confirm only that they received agenda version ${version.version} for \"${text(event.title, 500)}\" scheduled for ${event.starts_at}.`,
    "Do not ask them to confirm attendance. Do not treat receipt acknowledgement as RSVP, attendance, approval, agreement, or any new commitment.",
  ].join(" ");
}

async function cancelAgendaFollowUps({ task, partyId = null, kinds = null, version = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,contact_party_id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(500),
  );
  const allowedKinds = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_meeting_agenda !== true) return false;
    if (partyId && row.contact_party_id !== partyId) return false;
    if (allowedKinds && !allowedKinds.has(text(metadata.secretary_meeting_agenda_kind, 80))) return false;
    if (version !== null && Number(metadata.secretary_meeting_agenda_version) !== Number(version)) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1000), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids.length;
}

async function materializeCollectionFollowUps(task, event) {
  const metadata = object(task.metadata);
  const participants = list(metadata.participants);
  const ids = [];
  for (const participant of participants) {
    if (["RECEIVED", "LATE_RECEIVED"].includes(participant.contribution_status)) continue;
    const initial = await ensureFollowUp({
      task,
      event,
      participant,
      kind: "CONTRIBUTION_REQUEST",
      version: 0,
      dueAt: new Date().toISOString(),
      instruction: collectionInstruction(event, metadata.collection_deadline, "CONTRIBUTION_REQUEST"),
    });
    const chase = await ensureFollowUp({
      task,
      event,
      participant,
      kind: "CONTRIBUTION_CHASE",
      version: 0,
      dueAt: metadata.chase_at,
      instruction: collectionInstruction(event, metadata.collection_deadline, "CONTRIBUTION_CHASE"),
    });
    ids.push(initial.id, chase.id);
  }
  return [...new Set(ids)];
}

async function mutateAgendaTask(organization, calendarEventId, producer) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const task = await loadAgendaTask(organization, calendarEventId);
    if (!task) throw new Error("SECRETARY_MEETING_AGENDA_NOT_FOUND");
    const result = await producer(task, object(task.metadata));
    const patch = {
      ...(object(result.task_patch)),
      metadata: result.metadata,
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
    if (update.data) return { task: update.data, result: object(result.output) };
  }
  throw new Error("SECRETARY_MEETING_AGENDA_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryMeetingAgenda({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const event = await resolveCalendarEvent(organization, payload.calendar_event_id || payload.calendarEventId);
  const id = agendaTaskId(organization, event.id);
  let task = await loadAgendaTask(organization, event.id);
  if (!task) {
    const participants = await resolveParticipantRoster(organization, event, payload.participants);
    const times = operationalTimes(event, payload);
    const metadata = {
      secretary_role: "EXECUTIVE_SECRETARY",
      secretary_owned: true,
      agenda_kind: AGENDA_KIND,
      agenda_contract: CONTRACT,
      agenda_state: participants.length ? "COLLECTING" : "DRAFT",
      current_version: 0,
      working_items: normalizeItems(payload.items, { kind: "SECRETARY", partyId: actor, seed: id }),
      pre_read_references: normalizeReferences(payload.pre_read_references || payload.preReadReferences),
      versions: [],
      participants,
      collection_deadline: times.collection_deadline,
      chase_at: times.chase_at,
      revision_from_version: null,
      revision_change_note: null,
      distribution_version: null,
      distribution_queued_at: null,
      pending_redistribution: false,
      late_contributions: [],
      agenda_locked: false,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      distribution_delivery_not_inferred: true,
      external_authority_used: false,
    };
    const inserted = await supabaseAdmin.from("secretary_tasks").insert({
      id,
      organization_id: organization,
      entity_id: event.entity_id || context.entityId || null,
      owner_party_id: event.owner_party_id || actor,
      contact_party_id: event.contact_party_id || null,
      calendar_event_id: event.id,
      title: `Prepare agenda: ${text(event.title, 420)}`,
      details: `Durable Secretary-owned agenda lifecycle for calendar event ${event.id}.`,
      status: "IN_PROGRESS",
      priority: "HIGH",
      due_at: times.collection_deadline,
      remind_at: times.chase_at,
      source: "secretary",
      created_by_party_id: actor,
      metadata,
    }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      task = await loadAgendaTask(organization, event.id);
    } else task = inserted.data;
  }

  const current = object(task.metadata);
  const collectionFollowUpIds = ["DRAFT", "COLLECTING"].includes(current.agenda_state)
    ? await materializeCollectionFollowUps(task, event)
    : [];
  return {
    status: "started",
    contract: CONTRACT,
    task,
    calendar_event: event,
    collection_follow_up_ids: collectionFollowUpIds,
    deterministic_task_id: true,
    replay_safe: true,
    secretary_owns_collection_follow_through: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function addSecretaryMeetingAgendaItem({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
  const items = normalizeItems(payload.items || [payload.item], { kind: "SECRETARY", partyId: actor, seed: `add:${eventId}:${Date.now()}` });
  if (!items.length) throw new Error("SECRETARY_MEETING_AGENDA_ITEMS_REQUIRED");
  const mutation = await mutateAgendaTask(organization, eventId, async (task, metadata) => {
    if (["FINALIZED", "DISTRIBUTED"].includes(metadata.agenda_state)) {
      throw new Error("SECRETARY_MEETING_AGENDA_FINALIZED_USE_REVISE");
    }
    return {
      metadata: { ...metadata, working_items: [...list(metadata.working_items), ...items], agenda_state: metadata.participants?.length ? "COLLECTING" : "DRAFT" },
      output: { added_items: items },
    };
  });
  return { status: "updated", contract: CONTRACT, ...mutation.result, task: mutation.task, external_authority_used: false };
}

export async function recordSecretaryMeetingAgendaContribution({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
  const partyId = text(payload.participant_party_id || payload.participantPartyId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 200);
  if (!partyId) throw new Error("SECRETARY_MEETING_AGENDA_PARTICIPANT_PARTY_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_MEETING_AGENDA_CONTRIBUTION_EVIDENCE_REQUIRED");
  const items = normalizeItems(payload.items, { kind: "PARTICIPANT", partyId, evidenceId, seed: `contribution:${eventId}:${partyId}:${evidenceId}` });
  if (!items.length) throw new Error("SECRETARY_MEETING_AGENDA_CONTRIBUTION_ITEMS_REQUIRED");

  const mutation = await mutateAgendaTask(organization, eventId, async (task, metadata) => {
    const participants = list(metadata.participants);
    const index = participants.findIndex((row) => row.party_id === partyId);
    if (index < 0) throw new Error("SECRETARY_MEETING_AGENDA_PARTICIPANT_NOT_IN_ROSTER");
    const late = ["FINALIZED", "DISTRIBUTED"].includes(metadata.agenda_state);
    const nextParticipants = participants.map((row, position) => position === index ? {
      ...row,
      contribution_status: late ? "LATE_RECEIVED" : "RECEIVED",
      contribution_received_at: new Date().toISOString(),
      contribution_evidence_ids: [...new Set([...list(row.contribution_evidence_ids), evidenceId])],
    } : row);
    const next = {
      ...metadata,
      participants: nextParticipants,
      working_items: late ? list(metadata.working_items) : [...list(metadata.working_items), ...items],
      late_contributions: late ? [...list(metadata.late_contributions), { party_id: partyId, evidence_id: evidenceId, received_at: new Date().toISOString(), items }] : list(metadata.late_contributions),
      pending_redistribution: late ? true : metadata.pending_redistribution === true,
    };
    return { metadata: next, output: { late_contribution: late, requires_revision: late, contribution_items: items }, task_patch: { status: "IN_PROGRESS" } };
  });

  await cancelAgendaFollowUps({
    task: mutation.task,
    partyId,
    kinds: ["CONTRIBUTION_REQUEST", "CONTRIBUTION_CHASE"],
    reason: "Agenda contribution received with explicit evidence",
  });

  return {
    status: mutation.result.late_contribution ? "late_contribution_recorded" : "contribution_recorded",
    contract: CONTRACT,
    ...mutation.result,
    task: mutation.task,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function finalizeSecretaryMeetingAgenda({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
  const mutation = await mutateAgendaTask(organization, eventId, async (task, metadata) => {
    if (!["DRAFT", "COLLECTING"].includes(metadata.agenda_state)) throw new Error("SECRETARY_MEETING_AGENDA_NOT_EDITABLE");
    const items = list(metadata.working_items);
    if (!items.length) throw new Error("SECRETARY_MEETING_AGENDA_EMPTY");
    const missingRequired = list(metadata.participants).filter((row) => row.required !== false && row.contribution_status !== "RECEIVED");
    const deadlineReached = Date.parse(metadata.collection_deadline || 0) <= Date.now();
    if (missingRequired.length && !deadlineReached && payload.allow_missing_contributions !== true && payload.allowMissingContributions !== true) {
      throw new Error("SECRETARY_MEETING_AGENDA_REQUIRED_CONTRIBUTIONS_PENDING");
    }
    const versionNumber = Math.max(0, Number(metadata.current_version) || 0) + 1;
    const snapshot = {
      version: versionNumber,
      finalized_at: new Date().toISOString(),
      finalized_by_party_id: actor,
      change_note: text(payload.change_note || payload.changeNote || metadata.revision_change_note, 1000) || null,
      items,
      pre_read_references: list(metadata.pre_read_references),
      participant_contribution_statuses: list(metadata.participants).map((row) => ({ party_id: row.party_id, required: row.required !== false, contribution_status: row.contribution_status })),
      missing_required_contribution_party_ids: missingRequired.map((row) => row.party_id),
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
    };
    return {
      metadata: {
        ...metadata,
        agenda_state: "FINALIZED",
        current_version: versionNumber,
        versions: [...list(metadata.versions), snapshot].slice(-20),
        agenda_locked: true,
        finalized_at: snapshot.finalized_at,
        finalized_by_party_id: actor,
        revision_from_version: null,
        revision_change_note: null,
        pending_redistribution: true,
      },
      output: { version: snapshot, missing_required_contribution_party_ids: snapshot.missing_required_contribution_party_ids },
    };
  });

  await cancelAgendaFollowUps({
    task: mutation.task,
    kinds: ["CONTRIBUTION_REQUEST", "CONTRIBUTION_CHASE"],
    reason: "Agenda finalized; collection window closed",
  });

  return {
    status: "finalized",
    contract: CONTRACT,
    ...mutation.result,
    task: mutation.task,
    agenda_version_preserved: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function reviseSecretaryMeetingAgenda({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
  const items = normalizeItems(payload.items, { kind: "SECRETARY", partyId: actor, seed: `revise:${eventId}:${Date.now()}` });
  if (!items.length) throw new Error("SECRETARY_MEETING_AGENDA_REVISED_ITEMS_REQUIRED");
  const refs = normalizeReferences(payload.pre_read_references || payload.preReadReferences);
  const mutation = await mutateAgendaTask(organization, eventId, async (task, metadata) => {
    if (!["FINALIZED", "DISTRIBUTED"].includes(metadata.agenda_state)) throw new Error("SECRETARY_MEETING_AGENDA_REVISION_REQUIRES_FINALIZED_VERSION");
    const previousVersion = Number(metadata.current_version) || 0;
    return {
      metadata: {
        ...metadata,
        agenda_state: "DRAFT",
        agenda_locked: false,
        working_items: items,
        pre_read_references: refs,
        revision_from_version: previousVersion,
        revision_change_note: text(payload.change_note || payload.changeNote, 1000) || "Agenda revised",
        pending_redistribution: true,
        revised_at: new Date().toISOString(),
        revised_by_party_id: actor,
      },
      output: { revision_from_version: previousVersion },
    };
  });

  await cancelAgendaFollowUps({
    task: mutation.task,
    kinds: ["AGENDA_DISTRIBUTION", "AGENDA_RECEIPT_ACK_CHASE"],
    reason: "Agenda revised; stale pending distribution/receipt follow-up fenced",
  });

  return {
    status: "revision_opened",
    contract: CONTRACT,
    ...mutation.result,
    task: mutation.task,
    stale_pending_distribution_fenced: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function distributeSecretaryMeetingAgenda({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
  const event = await resolveCalendarEvent(organization, eventId);
  const task = await loadAgendaTask(organization, eventId);
  if (!task) throw new Error("SECRETARY_MEETING_AGENDA_NOT_FOUND");
  const metadata = object(task.metadata);
  if (!["FINALIZED", "DISTRIBUTED"].includes(metadata.agenda_state)) throw new Error("SECRETARY_MEETING_AGENDA_FINALIZE_BEFORE_DISTRIBUTION");
  const versionNumber = Number(metadata.current_version) || 0;
  const version = list(metadata.versions).find((row) => Number(row.version) === versionNumber);
  if (!version) throw new Error("SECRETARY_MEETING_AGENDA_FINALIZED_VERSION_NOT_FOUND");
  const participants = list(metadata.participants);
  const distributionIds = [];
  const acknowledgementIds = [];
  const now = Date.now();
  const eventStart = Date.parse(event.starts_at);

  for (const participant of participants) {
    const distribution = await ensureFollowUp({
      task,
      event,
      participant,
      kind: "AGENDA_DISTRIBUTION",
      version: versionNumber,
      dueAt: new Date().toISOString(),
      instruction: distributionInstruction(event, version),
    });
    distributionIds.push(distribution.id);
    if (eventStart - now > 30 * 60 * 1000) {
      const ackDue = new Date(eventStart - Math.min(12 * 60 * 60 * 1000, Math.max(30 * 60 * 1000, Math.floor((eventStart - now) / 2)))).toISOString();
      const acknowledgement = await ensureFollowUp({
        task,
        event,
        participant,
        kind: "AGENDA_RECEIPT_ACK_CHASE",
        version: versionNumber,
        dueAt: ackDue,
        instruction: acknowledgementInstruction(event, version),
      });
      acknowledgementIds.push(acknowledgement.id);
    }
  }

  const mutation = await mutateAgendaTask(organization, eventId, async (currentTask, currentMetadata) => {
    if (Number(currentMetadata.current_version) !== versionNumber) throw new Error("SECRETARY_MEETING_AGENDA_VERSION_CHANGED_DURING_DISTRIBUTION");
    return {
      metadata: {
        ...currentMetadata,
        agenda_state: "DISTRIBUTED",
        distribution_version: versionNumber,
        distribution_queued_at: new Date().toISOString(),
        distribution_follow_up_ids: distributionIds,
        acknowledgement_follow_up_ids: acknowledgementIds,
        pending_redistribution: false,
        participants: list(currentMetadata.participants).map((row) => ({ ...row, distribution_status: "QUEUED", acknowledgement_status: row.acknowledgement_status === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "PENDING" })),
        distribution_delivery_not_inferred: true,
      },
      output: {},
    };
  });

  return {
    status: "distribution_queued",
    contract: CONTRACT,
    task: mutation.task,
    version: versionNumber,
    distribution_follow_up_ids: distributionIds,
    acknowledgement_follow_up_ids: acknowledgementIds,
    deterministic_follow_up_ids: true,
    distribution_delivery_not_inferred: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function recordSecretaryMeetingAgendaAcknowledgement({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
  const partyId = text(payload.participant_party_id || payload.participantPartyId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 200);
  if (!partyId) throw new Error("SECRETARY_MEETING_AGENDA_PARTICIPANT_PARTY_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_MEETING_AGENDA_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED");
  if (payload.acknowledged !== true) throw new Error("SECRETARY_MEETING_AGENDA_EXPLICIT_ACKNOWLEDGEMENT_REQUIRED");

  const mutation = await mutateAgendaTask(organization, eventId, async (task, metadata) => {
    const participants = list(metadata.participants);
    const index = participants.findIndex((row) => row.party_id === partyId);
    if (index < 0) throw new Error("SECRETARY_MEETING_AGENDA_PARTICIPANT_NOT_IN_ROSTER");
    const now = new Date().toISOString();
    const nextParticipants = participants.map((row, position) => position === index ? {
      ...row,
      acknowledgement_status: "ACKNOWLEDGED",
      acknowledged_at: now,
      acknowledgement_evidence_id: evidenceId,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
    } : row);
    return { metadata: { ...metadata, participants: nextParticipants }, output: { acknowledged_at: now } };
  });

  await cancelAgendaFollowUps({
    task: mutation.task,
    partyId,
    kinds: ["AGENDA_RECEIPT_ACK_CHASE"],
    reason: "Agenda receipt explicitly acknowledged",
  });

  return {
    status: "acknowledgement_recorded",
    contract: CONTRACT,
    participant_party_id: partyId,
    evidence_id: evidenceId,
    task: mutation.task,
    receipt_acknowledgement_is_not_rsvp: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function readSecretaryMeetingAgenda({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
  const task = await loadAgendaTask(organization, eventId);
  if (!task) throw new Error("SECRETARY_MEETING_AGENDA_NOT_FOUND");
  const event = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", eventId)
      .maybeSingle(),
  );
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,contact_party_id,action_type,reason,status,due_at,result,completed_at,metadata,created_at,updated_at")
      .eq("organization_id", organization)
      .eq("task_id", task.id)
      .order("created_at", { ascending: true })
      .limit(500),
  );
  const metadata = object(task.metadata);
  const participants = list(metadata.participants);
  const missingContributions = participants.filter((row) => row.contribution_status === "PENDING");
  const acknowledgementsPending = participants.filter((row) => row.acknowledgement_status !== "ACKNOWLEDGED");
  return {
    status: "completed",
    contract: CONTRACT,
    task,
    calendar_event: event,
    agenda: {
      state: metadata.agenda_state,
      current_version: Number(metadata.current_version) || 0,
      working_items: list(metadata.working_items),
      pre_read_references: list(metadata.pre_read_references),
      versions: list(metadata.versions),
      participants,
      collection_deadline: metadata.collection_deadline || null,
      chase_at: metadata.chase_at || null,
      distribution_version: metadata.distribution_version ?? null,
      pending_redistribution: metadata.pending_redistribution === true,
      late_contributions: list(metadata.late_contributions),
      missing_contribution_party_ids: missingContributions.map((row) => row.party_id),
      acknowledgement_pending_party_ids: acknowledgementsPending.map((row) => row.party_id),
    },
    follow_ups: followUps,
    secretary_owns_follow_through: true,
    version_history_preserved: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    distribution_delivery_not_inferred: true,
    external_authority_used: false,
  };
}

export default Object.freeze({
  start: startSecretaryMeetingAgenda,
  read: readSecretaryMeetingAgenda,
  addItem: addSecretaryMeetingAgendaItem,
  recordContribution: recordSecretaryMeetingAgendaContribution,
  finalize: finalizeSecretaryMeetingAgenda,
  revise: reviseSecretaryMeetingAgenda,
  distribute: distributeSecretaryMeetingAgenda,
  acknowledge: recordSecretaryMeetingAgendaAcknowledgement,
});
