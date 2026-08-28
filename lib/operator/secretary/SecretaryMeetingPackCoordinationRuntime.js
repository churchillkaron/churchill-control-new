import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_PACK_COORDINATION_V1";
const SOURCE = "secretary_meeting_pack";
const ITEM_KINDS = new Set(["DOCUMENT", "AGENDA", "OTHER"]);
const DISTRIBUTION_STATES = new Set(["SENT", "DELIVERED", "FAILED"]);

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
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function iso(value, field) {
  const raw = text(value, 180);
  if (!raw) throw new Error(`SECRETARY_MEETING_PACK_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_MEETING_PACK_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function isoOptional(value, field) {
  const raw = text(value, 180);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_MEETING_PACK_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function safetyFlags() {
  return {
    document_store_created: false,
    file_content_read: false,
    distribution_delivery_inferred: false,
    acknowledgement_is_approval: false,
    acknowledgement_is_attendance: false,
    calendar_event_modified: false,
    external_message_sent_by_runtime: false,
    provider_calls_performed: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
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

function packId(organization, calendarEventId) {
  return deterministicUuid(`avantiqo-secretary-meeting-pack-v1:${organization}:${calendarEventId}`);
}

function itemId(pack, index, label) {
  return deterministicUuid(`avantiqo-secretary-meeting-pack-item-v1:${pack}:${index}:${label}`);
}

function followUpId(pack, kind, subjectId, version) {
  return deterministicUuid(`avantiqo-secretary-meeting-pack-follow-up-v1:${pack}:${kind}:${subjectId}:${version}`);
}

async function resolveCalendarEvent(organization, eventId) {
  const id = text(eventId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_PACK_CALENDAR_EVENT_REQUIRED");
  const event = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!event) throw new Error("SECRETARY_MEETING_PACK_CALENDAR_EVENT_NOT_FOUND");
  if (event.status === "CANCELLED") throw new Error("SECRETARY_MEETING_PACK_CALENDAR_EVENT_CANCELLED");
  return event;
}

async function ensureParty(organization, partyId) {
  const id = text(partyId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_PACK_PARTY_REQUIRED");
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error("SECRETARY_MEETING_PACK_PARTY_NOT_FOUND");
  return party;
}

async function routingFor({ context, instruction, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "DOCUMENT_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_MEETING_PACK_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_MEETING_PACK_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function normalizeChannel(value) {
  const channel = text(value || "OTHER", 40).toUpperCase();
  return ["EMAIL", "MESSAGE", "PORTAL", "COURIER", "OTHER"].includes(channel) ? channel : "OTHER";
}

async function normalizeRecipients(organization, recipients) {
  const rows = list(recipients).slice(0, 100).map((entry, index) => {
    const row = object(entry);
    const partyId = text(row.party_id || row.partyId, 120);
    if (!partyId) throw new Error(`SECRETARY_MEETING_PACK_RECIPIENT_PARTY_REQUIRED:${index}`);
    return {
      party_id: partyId,
      channel: normalizeChannel(row.channel),
      required_ack: row.required_ack !== false && row.requiredAck !== false,
      distribution_status: "NOT_DISTRIBUTED",
      distributed_at: null,
      distribution_evidence_id: null,
      delivery_reference: null,
      acknowledgement_status: "PENDING",
      acknowledged_at: null,
      acknowledgement_evidence_id: null,
    };
  });
  if (!rows.length) throw new Error("SECRETARY_MEETING_PACK_RECIPIENT_REQUIRED");
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.party_id)) throw new Error("SECRETARY_MEETING_PACK_RECIPIENT_DUPLICATE");
    seen.add(row.party_id);
    await ensureParty(organization, row.party_id);
  }
  return rows;
}

async function normalizeItems(organization, pack, items) {
  const rows = list(items).slice(0, 100).map((entry, index) => {
    const row = object(entry);
    const label = text(row.label || row.title, 500);
    if (!label) throw new Error(`SECRETARY_MEETING_PACK_ITEM_LABEL_REQUIRED:${index}`);
    const kind = text(row.kind || "OTHER", 40).toUpperCase();
    if (!ITEM_KINDS.has(kind)) throw new Error(`SECRETARY_MEETING_PACK_ITEM_KIND_INVALID:${index}`);
    return {
      id: text(row.id, 120) || itemId(pack, index, label),
      label,
      kind,
      required: row.required !== false,
      responsible_party_id: text(row.responsible_party_id || row.responsiblePartyId, 120) || null,
      due_at: isoOptional(row.due_at || row.dueAt, "item_due_at"),
      status: "EXPECTED",
      source_reference: null,
      document_id: null,
      document_version: null,
      evidence_id: null,
      recorded_at: null,
      unavailable_reason: null,
    };
  });
  if (!rows.length) throw new Error("SECRETARY_MEETING_PACK_ITEM_REQUIRED");
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error("SECRETARY_MEETING_PACK_ITEM_DUPLICATE");
    ids.add(row.id);
    if (row.responsible_party_id) await ensureParty(organization, row.responsible_party_id);
  }
  return rows;
}

async function loadPack(organization, payload = {}) {
  const direct = text(payload.pack_id || payload.packId, 120);
  let id = direct;
  if (!id) {
    const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
    if (!eventId) throw new Error("SECRETARY_MEETING_PACK_ID_REQUIRED");
    id = packId(organization, eventId);
  }
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_MEETING_PACK_NOT_FOUND");
  return task;
}

function registerFromTask(task) {
  const metadata = object(task.metadata);
  return {
    contract: CONTRACT,
    state: text(metadata.state, 40) || "DRAFT",
    version: Number(metadata.version) || 1,
    calendar_event_id: metadata.calendar_event_id || task.calendar_event_id || null,
    pack_title: metadata.pack_title || task.title || null,
    recipients: list(metadata.recipients),
    items: list(metadata.items),
    frozen_versions: list(metadata.frozen_versions),
    history: list(metadata.history),
    ...safetyFlags(),
  };
}

async function ensurePackFollowUp({ task, kind, subjectId, partyId, dueAt, instruction, version }) {
  const id = followUpId(task.id, kind, subjectId, version);
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
    contact_party_id: partyId || null,
    task_id: task.id,
    calendar_event_id: task.calendar_event_id || null,
    action_type: partyId ? "MESSAGE" : "REVIEW",
    reason: text(instruction, 4000),
    status: "PENDING",
    due_at: dueAt,
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: Boolean(partyId),
      execution_instruction: text(instruction, 4000),
      secretary_owned: true,
      secretary_meeting_pack: true,
      secretary_meeting_pack_contract: CONTRACT,
      secretary_meeting_pack_kind: kind,
      secretary_meeting_pack_subject_id: subjectId,
      secretary_meeting_pack_version: version,
      acknowledgement_is_approval: false,
      acknowledgement_is_attendance: false,
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

async function cancelPackFollowUps({ task, kinds = null, subjectId = null, reason }) {
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
    if (metadata.secretary_meeting_pack !== true) return false;
    if (allowed && !allowed.has(text(metadata.secretary_meeting_pack_kind, 80))) return false;
    if (subjectId && text(metadata.secretary_meeting_pack_subject_id, 120) !== text(subjectId, 120)) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids.length;
}

async function materializeCollectionFollowUps(task) {
  const register = registerFromTask(task);
  const ids = [];
  for (const item of register.items) {
    if (item.status !== "EXPECTED" || !item.responsible_party_id || !item.due_at) continue;
    const followUp = await ensurePackFollowUp({
      task,
      kind: "ITEM_COLLECTION",
      subjectId: item.id,
      partyId: item.responsible_party_id,
      dueAt: item.due_at,
      version: register.version,
      instruction: [
        `Request the meeting-pack item \"${text(item.label, 500)}\" for \"${text(register.pack_title, 500)}\".`,
        `Please obtain the item or explicit unavailability evidence by ${item.due_at}.`,
        "Do not claim the item was received, reviewed, approved, signed, accepted, or legally effective without separate explicit evidence.",
      ].join(" "),
    });
    ids.push(followUp.id);
  }
  return ids;
}

async function mutatePack({ context, payload = {}, eventName, instruction, producer }) {
  const organization = organizationId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_MEETING_PACK_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_MEETING_PACK_EXPECTED_VERSION_REQUIRED");
  const auth = await routingFor({ context, instruction, at: occurredAt });
  const payloadSha = sha256(payload);
  const task = await loadPack(organization, payload);
  const initial = registerFromTask(task);
  const replay = initial.history.find((entry) => entry.evidence_id === evidenceId);
  if (replay) {
    if (replay.event !== eventName || replay.payload_sha256 !== payloadSha) {
      throw new Error("SECRETARY_MEETING_PACK_EVIDENCE_REUSE_CONFLICT");
    }
    return { task, register: initial, replaySafe: true, auth, output: {} };
  }
  if (initial.version !== expectedVersion) throw new Error("SECRETARY_MEETING_PACK_STALE_VERSION");
  if (initial.state === "CANCELLED") throw new Error("SECRETARY_MEETING_PACK_CANCELLED");

  const produced = await producer({ task, register: initial, auth, evidenceId, occurredAt, payloadSha });
  const nextRegister = produced.register;
  const updated = await supabaseAdmin.from("secretary_tasks")
    .update({
      status: nextRegister.state === "CANCELLED" ? "CANCELLED" : "IN_PROGRESS",
      metadata: {
        ...object(task.metadata),
        ...nextRegister,
        ...safetyFlags(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization)
    .eq("id", task.id)
    .eq("updated_at", task.updated_at)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error("SECRETARY_MEETING_PACK_CONCURRENT_UPDATE_RETRY_REQUIRED");
  return { task: updated.data, register: registerFromTask(updated.data), replaySafe: false, auth, output: object(produced.output) };
}

function appendEvent(register, { event, evidenceId, occurredAt, actor, payloadSha, version, details = {} }) {
  return [...register.history, {
    event,
    evidence_id: evidenceId,
    occurred_at: occurredAt,
    recorded_by_party_id: actor,
    payload_sha256: payloadSha,
    version,
    ...details,
  }].slice(-500);
}

async function resolveMaterialReference(organization, payload = {}) {
  const documentId = text(payload.document_id || payload.documentId, 120) || null;
  const agendaTaskId = text(payload.agenda_task_id || payload.agendaTaskId, 120) || null;
  let sourceReference = text(payload.source_reference || payload.sourceReference, 1800) || null;
  let documentVersion = Number(payload.document_version ?? payload.documentVersion) || null;

  if (documentId) {
    const task = await one(
      supabaseAdmin.from("secretary_tasks")
        .select("id,metadata")
        .eq("organization_id", organization)
        .eq("id", documentId)
        .maybeSingle(),
    );
    const metadata = object(task?.metadata);
    if (!task || metadata.secretary_document_filing !== true) throw new Error("SECRETARY_MEETING_PACK_DOCUMENT_REFERENCE_INVALID");
    if (!documentVersion) documentVersion = Number(metadata.current_version) || null;
    const version = list(metadata.versions).find((row) => Number(row.version) === documentVersion);
    if (!version) throw new Error("SECRETARY_MEETING_PACK_DOCUMENT_VERSION_NOT_FOUND");
    sourceReference = sourceReference || text(version.source_reference, 1800) || null;
  }

  if (agendaTaskId) {
    const task = await one(
      supabaseAdmin.from("secretary_tasks")
        .select("id,metadata")
        .eq("organization_id", organization)
        .eq("id", agendaTaskId)
        .maybeSingle(),
    );
    const metadata = object(task?.metadata);
    if (!task || metadata.agenda_kind !== "MEETING_AGENDA") throw new Error("SECRETARY_MEETING_PACK_AGENDA_REFERENCE_INVALID");
    sourceReference = sourceReference || `secretary-task:${agendaTaskId}`;
  }

  if (!sourceReference) throw new Error("SECRETARY_MEETING_PACK_SOURCE_REFERENCE_REQUIRED");
  return { source_reference: sourceReference, document_id: documentId, document_version: documentVersion, agenda_task_id: agendaTaskId };
}

export async function startSecretaryMeetingPackCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_MEETING_PACK_EVIDENCE_REQUIRED");
  const startedAt = iso(payload.started_at || payload.startedAt, "started_at");
  const auth = await routingFor({ context, instruction: "Start an evidence-backed meeting-pack coordination lifecycle.", at: startedAt });
  const event = await resolveCalendarEvent(organization, payload.calendar_event_id || payload.calendarEventId);
  const id = packId(organization, event.id);
  const title = text(payload.pack_title || payload.packTitle, 500) || `${text(event.title, 420)} meeting pack`;
  const recipients = await normalizeRecipients(organization, payload.recipients);
  const items = await normalizeItems(organization, id, payload.items);
  const normalized = { calendar_event_id: event.id, pack_title: title, recipients, items, evidence_id: evidenceId, started_at: startedAt };
  const payloadSha = sha256(normalized);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) {
    const register = registerFromTask(existing);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay?.event === "MEETING_PACK_STARTED" && replay.payload_sha256 === payloadSha) {
      const followUpIds = await materializeCollectionFollowUps(existing);
      return { status: "started", contract: CONTRACT, task: existing, register, replay_safe: true, collection_follow_up_ids: followUpIds, ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() };
    }
    throw new Error("SECRETARY_MEETING_PACK_ALREADY_EXISTS");
  }

  const register = {
    contract: CONTRACT,
    state: "DRAFT",
    version: 1,
    calendar_event_id: event.id,
    pack_title: title,
    recipients,
    items,
    frozen_versions: [],
    history: [{ event: "MEETING_PACK_STARTED", evidence_id: evidenceId, occurred_at: startedAt, recorded_by_party_id: auth.actor, payload_sha256: payloadSha, version: 1 }],
    ...safetyFlags(),
  };
  const inserted = await supabaseAdmin.from("secretary_tasks").insert({
    id,
    organization_id: organization,
    entity_id: payload.entity_id || payload.entityId || context.entityId || null,
    owner_party_id: auth.operational,
    contact_party_id: recipients[0]?.party_id || null,
    calendar_event_id: event.id,
    title,
    details: `Durable Secretary meeting-pack coordination for calendar event ${event.id}; materials remain references only.`,
    status: "IN_PROGRESS",
    priority: "HIGH",
    due_at: event.starts_at,
    remind_at: null,
    source: SOURCE,
    created_by_party_id: auth.actor,
    metadata: { ...register, ...secretaryAdministrativeCoverageMetadata(auth.routing) },
  }).select("*").single();
  if (inserted.error) throw inserted.error;
  const followUpIds = await materializeCollectionFollowUps(inserted.data);
  return { status: "started", contract: CONTRACT, task: inserted.data, register: registerFromTask(inserted.data), replay_safe: false, collection_follow_up_ids: followUpIds, ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() };
}

export async function addSecretaryMeetingPackItem({ context, payload = {} } = {}) {
  return mutatePack({
    context,
    payload,
    eventName: "MEETING_PACK_ITEM_ADDED",
    instruction: "Add an explicitly requested item to a draft meeting pack.",
    producer: async ({ register, auth, evidenceId, occurredAt, payloadSha }) => {
      if (register.state !== "DRAFT") throw new Error("SECRETARY_MEETING_PACK_NOT_DRAFT");
      const label = text(payload.label || payload.title, 500);
      if (!label) throw new Error("SECRETARY_MEETING_PACK_ITEM_LABEL_REQUIRED");
      const kind = text(payload.kind || "OTHER", 40).toUpperCase();
      if (!ITEM_KINDS.has(kind)) throw new Error("SECRETARY_MEETING_PACK_ITEM_KIND_INVALID");
      const responsiblePartyId = text(payload.responsible_party_id || payload.responsiblePartyId, 120) || null;
      if (responsiblePartyId) await ensureParty(auth.organization, responsiblePartyId);
      const nextVersion = register.version + 1;
      const item = {
        id: deterministicUuid(`avantiqo-secretary-meeting-pack-item-v1:${register.calendar_event_id}:${evidenceId}:${label}`),
        label,
        kind,
        required: payload.required !== false,
        responsible_party_id: responsiblePartyId,
        due_at: isoOptional(payload.due_at || payload.dueAt, "item_due_at"),
        status: "EXPECTED",
        source_reference: null,
        document_id: null,
        document_version: null,
        evidence_id: null,
        recorded_at: null,
        unavailable_reason: null,
      };
      return {
        register: {
          ...register,
          version: nextVersion,
          items: [...register.items, item].slice(-100),
          history: appendEvent(register, { event: "MEETING_PACK_ITEM_ADDED", evidenceId, occurredAt, actor: auth.actor, payloadSha, version: nextVersion, details: { item_id: item.id } }),
        },
        output: { item },
      };
    },
  });
}

export async function recordSecretaryMeetingPackItem({ context, payload = {} } = {}) {
  const material = await resolveMaterialReference(organizationId(context), payload);
  const result = await mutatePack({
    context,
    payload,
    eventName: "MEETING_PACK_ITEM_READY",
    instruction: "Record an evidence-backed material reference in a draft meeting pack without reading or duplicating the source file.",
    producer: async ({ register, auth, evidenceId, occurredAt, payloadSha }) => {
      if (register.state !== "DRAFT") throw new Error("SECRETARY_MEETING_PACK_NOT_DRAFT");
      const itemIdValue = text(payload.item_id || payload.itemId, 120);
      const index = register.items.findIndex((item) => item.id === itemIdValue);
      if (index < 0) throw new Error("SECRETARY_MEETING_PACK_ITEM_NOT_FOUND");
      const nextVersion = register.version + 1;
      const items = [...register.items];
      items[index] = {
        ...items[index],
        status: "READY",
        ...material,
        evidence_id: evidenceId,
        recorded_at: occurredAt,
        unavailable_reason: null,
      };
      return {
        register: {
          ...register,
          version: nextVersion,
          items,
          history: appendEvent(register, { event: "MEETING_PACK_ITEM_READY", evidenceId, occurredAt, actor: auth.actor, payloadSha, version: nextVersion, details: { item_id: itemIdValue } }),
        },
        output: { item: items[index] },
      };
    },
  });
  if (!result.replaySafe) await cancelPackFollowUps({ task: result.task, kinds: ["ITEM_COLLECTION"], subjectId: payload.item_id || payload.itemId, reason: "Meeting-pack item received with explicit evidence." });
  return { status: "recorded", contract: CONTRACT, task: result.task, register: result.register, item: result.output.item || null, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function recordSecretaryMeetingPackItemUnavailable({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1600);
  if (!reason) throw new Error("SECRETARY_MEETING_PACK_UNAVAILABLE_REASON_REQUIRED");
  const result = await mutatePack({
    context,
    payload,
    eventName: "MEETING_PACK_ITEM_UNAVAILABLE",
    instruction: "Record explicit evidence that a meeting-pack item is unavailable without treating that as completion.",
    producer: async ({ register, auth, evidenceId, occurredAt, payloadSha }) => {
      if (register.state !== "DRAFT") throw new Error("SECRETARY_MEETING_PACK_NOT_DRAFT");
      const itemIdValue = text(payload.item_id || payload.itemId, 120);
      const index = register.items.findIndex((item) => item.id === itemIdValue);
      if (index < 0) throw new Error("SECRETARY_MEETING_PACK_ITEM_NOT_FOUND");
      const nextVersion = register.version + 1;
      const items = [...register.items];
      items[index] = { ...items[index], status: "UNAVAILABLE", evidence_id: evidenceId, recorded_at: occurredAt, unavailable_reason: reason, source_reference: null, document_id: null, document_version: null };
      return {
        register: {
          ...register,
          version: nextVersion,
          items,
          history: appendEvent(register, { event: "MEETING_PACK_ITEM_UNAVAILABLE", evidenceId, occurredAt, actor: auth.actor, payloadSha, version: nextVersion, details: { item_id: itemIdValue, reason } }),
        },
        output: { item: items[index] },
      };
    },
  });
  if (!result.replaySafe) await cancelPackFollowUps({ task: result.task, kinds: ["ITEM_COLLECTION"], subjectId: payload.item_id || payload.itemId, reason });
  return { status: "recorded", contract: CONTRACT, task: result.task, register: result.register, item: result.output.item || null, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function finalizeSecretaryMeetingPack({ context, payload = {} } = {}) {
  const result = await mutatePack({
    context,
    payload,
    eventName: "MEETING_PACK_FINALIZED",
    instruction: "Freeze a complete meeting-pack manifest for controlled distribution.",
    producer: async ({ register, auth, evidenceId, occurredAt, payloadSha }) => {
      if (register.state !== "DRAFT") throw new Error("SECRETARY_MEETING_PACK_NOT_DRAFT");
      const incomplete = register.items.filter((item) => item.required && item.status !== "READY");
      if (incomplete.length) throw new Error("SECRETARY_MEETING_PACK_REQUIRED_ITEMS_INCOMPLETE");
      const nextVersion = register.version + 1;
      const frozen = {
        pack_version: nextVersion,
        finalized_at: occurredAt,
        finalized_by_party_id: auth.actor,
        items: register.items.map((item) => ({ ...item })),
        recipients: register.recipients.map((recipient) => ({ ...recipient })),
      };
      return {
        register: {
          ...register,
          state: "FINALIZED",
          version: nextVersion,
          frozen_versions: [...register.frozen_versions, frozen].slice(-25),
          history: appendEvent(register, { event: "MEETING_PACK_FINALIZED", evidenceId, occurredAt, actor: auth.actor, payloadSha, version: nextVersion }),
        },
      };
    },
  });
  return { status: "finalized", contract: CONTRACT, task: result.task, register: result.register, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function recordSecretaryMeetingPackDistribution({ context, payload = {} } = {}) {
  const result = await mutatePack({
    context,
    payload,
    eventName: "MEETING_PACK_DISTRIBUTION_RECORDED",
    instruction: "Record explicit distribution evidence for a finalized meeting pack without inferring delivery or acknowledgement.",
    producer: async ({ register, auth, evidenceId, occurredAt, payloadSha }) => {
      if (!["FINALIZED", "DISTRIBUTED"].includes(register.state)) throw new Error("SECRETARY_MEETING_PACK_NOT_FINALIZED");
      const recipientPartyId = text(payload.recipient_party_id || payload.recipientPartyId, 120);
      const index = register.recipients.findIndex((recipient) => recipient.party_id === recipientPartyId);
      if (index < 0) throw new Error("SECRETARY_MEETING_PACK_RECIPIENT_NOT_FOUND");
      const distributionStatus = text(payload.distribution_status || payload.distributionStatus, 40).toUpperCase();
      if (!DISTRIBUTION_STATES.has(distributionStatus)) throw new Error("SECRETARY_MEETING_PACK_DISTRIBUTION_STATUS_INVALID");
      const nextVersion = register.version + 1;
      const recipients = [...register.recipients];
      recipients[index] = {
        ...recipients[index],
        channel: normalizeChannel(payload.channel || recipients[index].channel),
        distribution_status: distributionStatus,
        distributed_at: occurredAt,
        distribution_evidence_id: evidenceId,
        delivery_reference: text(payload.delivery_reference || payload.deliveryReference, 1800) || null,
        acknowledgement_status: distributionStatus === "FAILED" ? "PENDING" : recipients[index].acknowledgement_status,
      };
      const anyDistributed = recipients.some((recipient) => ["SENT", "DELIVERED"].includes(recipient.distribution_status));
      return {
        register: {
          ...register,
          state: anyDistributed ? "DISTRIBUTED" : register.state,
          version: nextVersion,
          recipients,
          history: appendEvent(register, { event: "MEETING_PACK_DISTRIBUTION_RECORDED", evidenceId, occurredAt, actor: auth.actor, payloadSha, version: nextVersion, details: { recipient_party_id: recipientPartyId, distribution_status: distributionStatus } }),
        },
        output: { recipient: recipients[index] },
      };
    },
  });
  if (!result.replaySafe && result.output.recipient?.required_ack === true && ["SENT", "DELIVERED"].includes(result.output.recipient.distribution_status)) {
    await ensurePackFollowUp({
      task: result.task,
      kind: "ACKNOWLEDGEMENT",
      subjectId: result.output.recipient.party_id,
      partyId: result.output.recipient.party_id,
      dueAt: result.output.recipient.distributed_at,
      version: result.register.version,
      instruction: [
        `Request acknowledgement of receipt of meeting-pack version ${result.register.version} for \"${text(result.register.pack_title, 500)}\".`,
        "Ask only whether the pack was received. An acknowledgement is not approval, agreement, RSVP, attendance confirmation, or acceptance of any content.",
      ].join(" "),
    });
  }
  return { status: "recorded", contract: CONTRACT, task: result.task, register: result.register, recipient: result.output.recipient || null, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function recordSecretaryMeetingPackAcknowledgement({ context, payload = {} } = {}) {
  const result = await mutatePack({
    context,
    payload,
    eventName: "MEETING_PACK_ACKNOWLEDGEMENT_RECORDED",
    instruction: "Record explicit acknowledgement that a distributed meeting pack was received, without treating it as approval or attendance.",
    producer: async ({ register, auth, evidenceId, occurredAt, payloadSha }) => {
      if (register.state !== "DISTRIBUTED") throw new Error("SECRETARY_MEETING_PACK_NOT_DISTRIBUTED");
      const recipientPartyId = text(payload.recipient_party_id || payload.recipientPartyId, 120);
      const index = register.recipients.findIndex((recipient) => recipient.party_id === recipientPartyId);
      if (index < 0) throw new Error("SECRETARY_MEETING_PACK_RECIPIENT_NOT_FOUND");
      if (!["SENT", "DELIVERED"].includes(register.recipients[index].distribution_status)) {
        throw new Error("SECRETARY_MEETING_PACK_RECIPIENT_NOT_DISTRIBUTED");
      }
      const nextVersion = register.version + 1;
      const recipients = [...register.recipients];
      recipients[index] = { ...recipients[index], acknowledgement_status: "ACKNOWLEDGED", acknowledged_at: occurredAt, acknowledgement_evidence_id: evidenceId };
      return {
        register: {
          ...register,
          version: nextVersion,
          recipients,
          history: appendEvent(register, { event: "MEETING_PACK_ACKNOWLEDGEMENT_RECORDED", evidenceId, occurredAt, actor: auth.actor, payloadSha, version: nextVersion, details: { recipient_party_id: recipientPartyId } }),
        },
        output: { recipient: recipients[index] },
      };
    },
  });
  if (!result.replaySafe) await cancelPackFollowUps({ task: result.task, kinds: ["ACKNOWLEDGEMENT"], subjectId: payload.recipient_party_id || payload.recipientPartyId, reason: "Meeting-pack receipt acknowledged with explicit evidence." });
  return { status: "recorded", contract: CONTRACT, task: result.task, register: result.register, recipient: result.output.recipient || null, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function reopenSecretaryMeetingPackForRevision({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1600);
  if (!reason) throw new Error("SECRETARY_MEETING_PACK_REVISION_REASON_REQUIRED");
  const result = await mutatePack({
    context,
    payload,
    eventName: "MEETING_PACK_REOPENED_FOR_REVISION",
    instruction: "Reopen a finalized or distributed meeting pack for an explicit revision while preserving prior frozen versions.",
    producer: async ({ register, auth, evidenceId, occurredAt, payloadSha }) => {
      if (!["FINALIZED", "DISTRIBUTED"].includes(register.state)) throw new Error("SECRETARY_MEETING_PACK_REVISION_STATE_INVALID");
      const nextVersion = register.version + 1;
      const recipients = register.recipients.map((recipient) => ({
        ...recipient,
        distribution_status: "NOT_DISTRIBUTED",
        distributed_at: null,
        distribution_evidence_id: null,
        delivery_reference: null,
        acknowledgement_status: "PENDING",
        acknowledged_at: null,
        acknowledgement_evidence_id: null,
      }));
      return {
        register: {
          ...register,
          state: "DRAFT",
          version: nextVersion,
          recipients,
          history: appendEvent(register, { event: "MEETING_PACK_REOPENED_FOR_REVISION", evidenceId, occurredAt, actor: auth.actor, payloadSha, version: nextVersion, details: { reason } }),
        },
      };
    },
  });
  if (!result.replaySafe) await cancelPackFollowUps({ task: result.task, reason: "Meeting pack reopened for a newer revision." });
  return { status: "reopened", contract: CONTRACT, task: result.task, register: result.register, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function cancelSecretaryMeetingPackCoordination({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1600);
  if (!reason) throw new Error("SECRETARY_MEETING_PACK_CANCEL_REASON_REQUIRED");
  const result = await mutatePack({
    context,
    payload,
    eventName: "MEETING_PACK_CANCELLED",
    instruction: "Cancel only the Secretary meeting-pack coordination lifecycle while leaving the calendar event and source documents unchanged.",
    producer: async ({ register, auth, evidenceId, occurredAt, payloadSha }) => {
      const nextVersion = register.version + 1;
      return {
        register: {
          ...register,
          state: "CANCELLED",
          version: nextVersion,
          history: appendEvent(register, { event: "MEETING_PACK_CANCELLED", evidenceId, occurredAt, actor: auth.actor, payloadSha, version: nextVersion, details: { reason } }),
        },
      };
    },
  });
  if (!result.replaySafe) await cancelPackFollowUps({ task: result.task, reason });
  return { status: "cancelled", contract: CONTRACT, task: result.task, register: result.register, replay_safe: result.replaySafe, calendar_event_cancelled: false, source_documents_modified: false, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function readSecretaryMeetingPackCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const task = await loadPack(organization, payload);
  const register = registerFromTask(task);
  return {
    status: "completed",
    contract: CONTRACT,
    task,
    register,
    required_items_incomplete: register.items.filter((item) => item.required && item.status !== "READY"),
    required_acknowledgements_pending: register.recipients.filter((recipient) => recipient.required_ack && recipient.acknowledgement_status !== "ACKNOWLEDGED"),
    ...safetyFlags(),
  };
}

export async function listSecretaryMeetingPackCoordinations({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const states = list(payload.states).map((value) => text(value, 40).toUpperCase()).filter(Boolean);
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(payload.limit) || 100, 500)));
  const rows = await many(query);
  const packs = rows.map((task) => ({ task, register: registerFromTask(task) }))
    .filter((row) => !states.length || states.includes(row.register.state));
  return { status: "completed", contract: CONTRACT, packs, count: packs.length, ...safetyFlags() };
}

export default Object.freeze({
  start: startSecretaryMeetingPackCoordination,
  addItem: addSecretaryMeetingPackItem,
  recordItem: recordSecretaryMeetingPackItem,
  recordUnavailable: recordSecretaryMeetingPackItemUnavailable,
  finalize: finalizeSecretaryMeetingPack,
  recordDistribution: recordSecretaryMeetingPackDistribution,
  acknowledge: recordSecretaryMeetingPackAcknowledgement,
  reopen: reopenSecretaryMeetingPackForRevision,
  cancel: cancelSecretaryMeetingPackCoordination,
  read: readSecretaryMeetingPackCoordination,
  list: listSecretaryMeetingPackCoordinations,
});
