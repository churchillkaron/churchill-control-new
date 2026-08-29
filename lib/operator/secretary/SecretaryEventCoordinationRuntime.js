import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_EVENT_COORDINATION_V1";
const SOURCE = "secretary_event_coordination";
const REGISTER_KEY = "event_coordination_v1";
const ACTIVE_STATES = new Set(["OPEN", "READY"]);
const REFERENCE_KINDS = new Set(["DEADLINE", "CORRESPONDENCE", "DOCUMENT", "MEETING_PACK", "OTHER"]);

const COMPONENT_SPECS = Object.freeze({
  GUESTS: Object.freeze({ source: "secretary_event_guest_coordination", register_key: "event_guest_coordination_v1", contract: "AVANTIQO_EXECUTIVE_SECRETARY_EVENT_GUEST_COORDINATION_V1", ready_states: Object.freeze(["FINALIZED"]) }),
  RESOURCE: Object.freeze({ source: "secretary_resource_reservation", register_key: "resource_reservation_v1", contract: "AVANTIQO_EXECUTIVE_SECRETARY_RESOURCE_RESERVATION_V1", ready_states: Object.freeze(["RESERVED"]) }),
  HOSPITALITY: Object.freeze({ source: "secretary_hospitality_coordination", register_key: "hospitality_coordination_v1", contract: "AVANTIQO_EXECUTIVE_SECRETARY_HOSPITALITY_COORDINATION_V1", ready_states: Object.freeze(["READY_FOR_EVENT", "COMPLETED"]) }),
});

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function organizationId(context = {}) { const id = text(context.organizationId, 120); if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED"); return id; }
function actorPartyId(context = {}) { const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120); if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED"); return id; }
function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) { if (required) throw new Error(`SECRETARY_EVENT_COORDINATION_${field.toUpperCase()}_REQUIRED`); return null; }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_EVENT_COORDINATION_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}
function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}
function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}
function payloadHash(value) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function safetyFlags() {
  return {
    child_workflow_mutated: false,
    child_completion_inferred: false,
    attendance_inferred: false,
    invitation_delivery_inferred: false,
    physical_access_granted_by_secretary: false,
    calendar_event_created: false,
    calendar_event_modified: false,
    resource_reserved_by_parent: false,
    room_setup_performed: false,
    catering_ordered: false,
    purchase_performed: false,
    order_placed: false,
    quote_accepted: false,
    vendor_terms_accepted: false,
    vendor_commitment_created: false,
    external_booking_performed: false,
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
  const routing = await resolveSecretaryAdministrativeCoverage({ organizationId: organization, ownerPartyId: owner, scope: "TASK_ROUTING", instruction, at, requiresOwnerAuthority: false });
  if (routing.coverage_routing_review_required === true) throw new Error(`SECRETARY_EVENT_COORDINATION_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_EVENT_COORDINATION_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function resolveCalendarEvent(organization, calendarEventId) {
  const id = text(calendarEventId, 120);
  if (!id) return null;
  const event = await one(supabaseAdmin.from("secretary_calendar_events").select("id,title,description,event_type,status,starts_at,ends_at,timezone,location,updated_at").eq("organization_id", organization).eq("id", id).maybeSingle());
  if (!event) throw new Error("SECRETARY_EVENT_COORDINATION_CALENDAR_EVENT_NOT_FOUND");
  if (event.status === "CANCELLED") throw new Error("SECRETARY_EVENT_COORDINATION_CALENDAR_EVENT_CANCELLED");
  return event;
}

function normalizeComponent(value) {
  const row = object(value);
  const kind = text(row.kind, 80).toUpperCase();
  const spec = COMPONENT_SPECS[kind];
  if (!spec) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_KIND_INVALID");
  const taskId = text(row.task_id || row.taskId, 120);
  if (!taskId) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_TASK_ID_REQUIRED");
  return { kind, task_id: taskId, required: row.required !== false };
}
function normalizeComponents(value) {
  const rows = list(value).slice(0, 50).map(normalizeComponent);
  const keys = new Set();
  for (const row of rows) { const key = `${row.kind}:${row.task_id}`; if (keys.has(key)) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_DUPLICATE"); keys.add(key); }
  return rows;
}
function normalizeReference(value) {
  const row = object(value);
  const kind = text(row.kind || "OTHER", 80).toUpperCase();
  if (!REFERENCE_KINDS.has(kind)) throw new Error("SECRETARY_EVENT_COORDINATION_REFERENCE_KIND_INVALID");
  const referenceId = text(row.reference_id || row.referenceId, 500);
  if (!referenceId) throw new Error("SECRETARY_EVENT_COORDINATION_REFERENCE_ID_REQUIRED");
  return { kind, reference_id: referenceId, label: text(row.label, 500) || null, note: text(row.note, 1600) || null };
}
function normalizeReferences(value) {
  const rows = list(value).slice(0, 100).map(normalizeReference);
  const keys = new Set();
  for (const row of rows) { const key = `${row.kind}:${row.reference_id}`; if (keys.has(key)) throw new Error("SECRETARY_EVENT_COORDINATION_REFERENCE_DUPLICATE"); keys.add(key); }
  return rows;
}

async function componentSnapshot(organization, component) {
  const spec = COMPONENT_SPECS[component.kind];
  const task = await one(supabaseAdmin.from("secretary_tasks").select("id,source,status,metadata,updated_at").eq("organization_id", organization).eq("id", component.task_id).maybeSingle());
  if (!task) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_NOT_FOUND");
  if (task.source !== spec.source) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_SOURCE_MISMATCH");
  const child = object(object(task.metadata)[spec.register_key]);
  if (child.contract !== spec.contract) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_CONTRACT_MISMATCH");
  const childState = text(child.state, 80).toUpperCase();
  const ready = spec.ready_states.includes(childState) && task.status !== "CANCELLED";
  return { ...component, source: spec.source, child_contract: spec.contract, child_state: childState || null, child_version: Number(child.version) || null, child_task_status: task.status || null, child_updated_at: task.updated_at || null, ready };
}
async function snapshotComponents(organization, components) { const snapshots = []; for (const component of list(components)) snapshots.push(await componentSnapshot(organization, component)); return snapshots; }

export function evaluateSecretaryEventReadiness({ calendarSnapshot = null, componentSnapshots = [] } = {}) {
  const components = list(componentSnapshots);
  const required = components.filter((row) => row.required !== false);
  const requiredNotReady = required.filter((row) => row.ready !== true);
  const hasGovernedReadinessSource = Boolean(calendarSnapshot || components.length);
  const calendarReady = calendarSnapshot ? calendarSnapshot.status !== "CANCELLED" : null;
  return {
    ready: hasGovernedReadinessSource && requiredNotReady.length === 0 && calendarReady !== false,
    has_governed_readiness_source: hasGovernedReadinessSource,
    required_count: required.length,
    required_ready_count: required.length - requiredNotReady.length,
    required_not_ready: requiredNotReady.map((row) => ({ kind: row.kind, task_id: row.task_id, child_state: row.child_state || null })),
    calendar_ready: calendarReady,
    readiness_inferred: false,
  };
}
function calendarSnapshot(event) { return event ? { calendar_event_id: event.id, status: event.status, starts_at: event.starts_at, ends_at: event.ends_at, timezone: event.timezone, location: event.location, updated_at: event.updated_at || null } : null; }
function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_EVENT_COORDINATION_RECORD_INVALID");
  return { ...register, components: list(register.components), component_snapshots: list(register.component_snapshots), supporting_references: list(register.supporting_references), frozen_ready_snapshots: list(register.frozen_ready_snapshots), history: list(register.history) };
}
async function readTask(organization, coordinationId) {
  const task = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("id", coordinationId).maybeSingle());
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_EVENT_COORDINATION_NOT_FOUND");
  return task;
}
function historyEntry({ event, evidenceId, at, actor, version, hash, details = {} }) { return { event, evidence_id: evidenceId, occurred_at: at, recorded_by_party_id: actor, version, payload_sha256: hash, ...object(details), ...safetyFlags() }; }
async function refreshSnapshots(organization, register) {
  const calendar = await resolveCalendarEvent(organization, register.calendar_event_id);
  const components = await snapshotComponents(organization, register.components);
  const readiness = evaluateSecretaryEventReadiness({ calendarSnapshot: calendarSnapshot(calendar), componentSnapshots: components });
  return { calendar: calendarSnapshot(calendar), components, readiness };
}

async function mutateEvent({ context, payload = {}, instruction, eventName, allowedStates, producer }) {
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_EVENT_COORDINATION_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_EVENT_COORDINATION_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_EVENT_COORDINATION_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = payloadHash(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, coordinationId);
    const register = registerFromTask(task);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) { if (replay.event === eventName && replay.payload_sha256 === hash) return { status: "completed", contract: CONTRACT, coordination: task, record: register, replay_safe: true, ...safetyFlags() }; throw new Error("SECRETARY_EVENT_COORDINATION_EVIDENCE_REUSE_CONFLICT"); }
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_EVENT_COORDINATION_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_EVENT_COORDINATION_STALE_VERSION");
    const produced = await producer({ task, register, auth, occurredAt, evidenceId });
    const nextVersion = expectedVersion + 1;
    const next = { ...register, ...object(produced.patch), contract: CONTRACT, version: nextVersion, history: [...register.history, historyEntry({ event: eventName, evidenceId, at: occurredAt, actor: auth.actor, version: nextVersion, hash, details: produced.historyDetails })].slice(-500), ...safetyFlags() };
    const terminal = ["COMPLETED", "CANCELLED"].includes(next.state);
    const update = await supabaseAdmin.from("secretary_tasks").update({ status: next.state === "CANCELLED" ? "CANCELLED" : terminal ? "DONE" : "IN_PROGRESS", completed_at: terminal ? occurredAt : null, metadata: { ...object(task.metadata), [REGISTER_KEY]: next, secretary_event_coordination_contract: CONTRACT, secretary_event_coordination_state: next.state, ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() }, updated_at: new Date().toISOString() }).eq("organization_id", auth.organization).eq("id", task.id).eq("updated_at", task.updated_at).select("*").maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) continue;
    return { status: "completed", contract: CONTRACT, coordination: update.data, record: next, replay_safe: false, ...safetyFlags() };
  }
  throw new Error("SECRETARY_EVENT_COORDINATION_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryEventCoordination({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_EVENT_COORDINATION_EVIDENCE_REQUIRED");
  const startedAt = iso(payload.started_at || payload.startedAt, "started_at");
  const auth = await routingFor({ context, instruction: "Own executive event coordination across already-governed Secretary child workflows.", at: startedAt });
  const calendar = await resolveCalendarEvent(auth.organization, payload.calendar_event_id || payload.calendarEventId);
  const title = text(calendar?.title || payload.title, 600);
  if (!title) throw new Error("SECRETARY_EVENT_COORDINATION_TITLE_REQUIRED");
  const startsAt = iso(calendar?.starts_at || payload.starts_at || payload.startsAt, "starts_at");
  const endsAt = iso(calendar?.ends_at || payload.ends_at || payload.endsAt, "ends_at");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_EVENT_COORDINATION_WINDOW_INVALID");
  const timezone = text(calendar?.timezone || payload.timezone || context.timezone, 120) || "UTC";
  const location = text(calendar?.location || payload.location, 1000) || null;
  const components = normalizeComponents(payload.components);
  const supportingReferences = normalizeReferences(payload.supporting_references || payload.supportingReferences);
  const snapshots = await snapshotComponents(auth.organization, components);
  const readiness = evaluateSecretaryEventReadiness({ calendarSnapshot: calendarSnapshot(calendar), componentSnapshots: snapshots });
  const coordinationId = deterministicUuid(`avantiqo-secretary-event-coordination-v1:${auth.organization}:${evidenceId}`);
  const startBody = { coordinationId, title, startsAt, endsAt, timezone, location, calendar_event_id: calendar?.id || null, components, supportingReferences, evidenceId, startedAt };
  const hash = payloadHash(startBody);
  const existing = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", auth.organization).eq("id", coordinationId).maybeSingle());
  if (existing) { const register = registerFromTask(existing); const first = register.history[0]; if (first?.event === "EVENT_COORDINATION_STARTED" && first?.evidence_id === evidenceId && first?.payload_sha256 === hash) return { status: "open", contract: CONTRACT, coordination: existing, record: register, replay_safe: true, ...safetyFlags() }; throw new Error("SECRETARY_EVENT_COORDINATION_EVIDENCE_REUSE_CONFLICT"); }
  const register = { contract: CONTRACT, coordination_id: coordinationId, state: "OPEN", version: 1, calendar_event_id: calendar?.id || null, title, starts_at: startsAt, ends_at: endsAt, timezone, location, canonical_owner_party_id: auth.owner, operational_assignee_party_id: auth.operational, components, component_snapshots: snapshots, supporting_references: supportingReferences, calendar_snapshot: calendarSnapshot(calendar), readiness, frozen_ready_snapshots: [], started_at: startedAt, ready_at: null, completed_at: null, cancelled_at: null, cancellation_reason: null, history: [historyEntry({ event: "EVENT_COORDINATION_STARTED", evidenceId, at: startedAt, actor: auth.actor, version: 1, hash, details: { component_count: components.length } })], ...safetyFlags() };
  const task = await one(supabaseAdmin.from("secretary_tasks").insert({ id: coordinationId, organization_id: auth.organization, entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null, owner_party_id: auth.operational, contact_party_id: null, calendar_event_id: calendar?.id || null, title: `Event coordination: ${title}`, details: "Supervise event readiness by linking already-governed guest, resource, hospitality, deadline, correspondence and document workflows without duplicating or mutating child authority.", status: "IN_PROGRESS", priority: "NORMAL", due_at: startsAt, remind_at: null, completed_at: null, source: SOURCE, created_by_party_id: auth.actor, metadata: { [REGISTER_KEY]: register, secretary_event_coordination_contract: CONTRACT, secretary_event_coordination_state: "OPEN", ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() } }).select("*").single());
  return { status: "open", contract: CONTRACT, coordination: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function linkSecretaryEventComponent({ context, payload = {} } = {}) {
  const component = normalizeComponent(payload.component || payload);
  return mutateEvent({ context, payload, instruction: `Link an existing governed ${component.kind.toLowerCase()} workflow to event coordination.`, eventName: "EVENT_COMPONENT_LINKED", allowedStates: new Set(["OPEN"]), producer: async ({ register, auth }) => {
    if (register.components.some((row) => row.kind === component.kind && row.task_id === component.task_id)) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_DUPLICATE");
    const components = [...register.components, component];
    const refreshed = await snapshotComponents(auth.organization, components);
    const readiness = evaluateSecretaryEventReadiness({ calendarSnapshot: register.calendar_snapshot, componentSnapshots: refreshed });
    return { patch: { components, component_snapshots: refreshed, readiness }, historyDetails: { component_kind: component.kind, component_task_id: component.task_id, required: component.required } };
  } });
}
export async function unlinkSecretaryEventComponent({ context, payload = {} } = {}) {
  const kind = text(payload.kind, 80).toUpperCase(); const taskId = text(payload.task_id || payload.taskId, 120); if (!COMPONENT_SPECS[kind] || !taskId) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_REQUIRED");
  return mutateEvent({ context, payload, instruction: "Remove one linked child workflow from open event coordination without mutating that child workflow.", eventName: "EVENT_COMPONENT_UNLINKED", allowedStates: new Set(["OPEN"]), producer: async ({ register, auth }) => {
    const components = register.components.filter((row) => !(row.kind === kind && row.task_id === taskId));
    if (components.length === register.components.length) throw new Error("SECRETARY_EVENT_COORDINATION_COMPONENT_NOT_LINKED");
    const refreshed = await snapshotComponents(auth.organization, components);
    const readiness = evaluateSecretaryEventReadiness({ calendarSnapshot: register.calendar_snapshot, componentSnapshots: refreshed });
    return { patch: { components, component_snapshots: refreshed, readiness }, historyDetails: { component_kind: kind, component_task_id: taskId } };
  } });
}
export async function linkSecretaryEventReference({ context, payload = {} } = {}) {
  const reference = normalizeReference(payload.reference || payload);
  return mutateEvent({ context, payload, instruction: `Link an explicit ${reference.kind.toLowerCase()} reference to event coordination.`, eventName: "EVENT_REFERENCE_LINKED", allowedStates: new Set(["OPEN"]), producer: async ({ register }) => {
    if (register.supporting_references.some((row) => row.kind === reference.kind && row.reference_id === reference.reference_id)) throw new Error("SECRETARY_EVENT_COORDINATION_REFERENCE_DUPLICATE");
    return { patch: { supporting_references: [...register.supporting_references, reference] }, historyDetails: { reference_kind: reference.kind, reference_id: reference.reference_id } };
  } });
}
export async function unlinkSecretaryEventReference({ context, payload = {} } = {}) {
  const kind = text(payload.kind || "OTHER", 80).toUpperCase(); const referenceId = text(payload.reference_id || payload.referenceId, 500); if (!REFERENCE_KINDS.has(kind) || !referenceId) throw new Error("SECRETARY_EVENT_COORDINATION_REFERENCE_REQUIRED");
  return mutateEvent({ context, payload, instruction: "Remove one supporting event reference without deleting or mutating the referenced record.", eventName: "EVENT_REFERENCE_UNLINKED", allowedStates: new Set(["OPEN"]), producer: async ({ register }) => {
    const rows = register.supporting_references.filter((row) => !(row.kind === kind && row.reference_id === referenceId));
    if (rows.length === register.supporting_references.length) throw new Error("SECRETARY_EVENT_COORDINATION_REFERENCE_NOT_LINKED");
    return { patch: { supporting_references: rows }, historyDetails: { reference_kind: kind, reference_id: referenceId } };
  } });
}
export async function refreshSecretaryEventCoordination({ context, payload = {} } = {}) {
  return mutateEvent({ context, payload, instruction: "Refresh event readiness from current child workflow records without mutating any child.", eventName: "EVENT_COORDINATION_REFRESHED", allowedStates: ACTIVE_STATES, producer: async ({ register, auth }) => {
    const refreshed = await refreshSnapshots(auth.organization, register);
    return { patch: { calendar_snapshot: refreshed.calendar, component_snapshots: refreshed.components, readiness: refreshed.readiness }, historyDetails: { ready: refreshed.readiness.ready, required_not_ready: refreshed.readiness.required_not_ready } };
  } });
}
export async function markSecretaryEventReady({ context, payload = {} } = {}) {
  return mutateEvent({ context, payload, instruction: "Freeze an evidence-backed event readiness snapshot only after all required linked workflows are ready.", eventName: "EVENT_COORDINATION_MARKED_READY", allowedStates: new Set(["OPEN"]), producer: async ({ register, auth, occurredAt, evidenceId }) => {
    const refreshed = await refreshSnapshots(auth.organization, register);
    if (!refreshed.readiness.ready) throw new Error("SECRETARY_EVENT_COORDINATION_REQUIRED_COMPONENTS_NOT_READY");
    const frozen = { frozen_at: occurredAt, evidence_id: evidenceId, calendar_snapshot: refreshed.calendar, component_snapshots: refreshed.components, supporting_references: register.supporting_references, readiness: refreshed.readiness, child_workflow_mutated: false, readiness_inferred: false };
    return { patch: { state: "READY", ready_at: occurredAt, calendar_snapshot: refreshed.calendar, component_snapshots: refreshed.components, readiness: refreshed.readiness, frozen_ready_snapshots: [...register.frozen_ready_snapshots, frozen].slice(-20) }, historyDetails: { required_count: refreshed.readiness.required_count, frozen_snapshot: true } };
  } });
}
export async function reopenSecretaryEventCoordination({ context, payload = {} } = {}) { return mutateEvent({ context, payload, instruction: "Reopen a ready event coordination record for explicit revision while preserving the prior frozen snapshot.", eventName: "EVENT_COORDINATION_REOPENED", allowedStates: new Set(["READY"]), producer: async () => ({ patch: { state: "OPEN", ready_at: null } }) }); }
export async function completeSecretaryEventCoordination({ context, payload = {} } = {}) {
  const summary = text(payload.completion_summary || payload.completionSummary, 3000); if (!summary) throw new Error("SECRETARY_EVENT_COORDINATION_COMPLETION_SUMMARY_REQUIRED");
  return mutateEvent({ context, payload, instruction: "Close event coordination from explicit completion evidence without inferring attendance, service quality, payments or legal effect.", eventName: "EVENT_COORDINATION_COMPLETED", allowedStates: new Set(["READY"]), producer: async ({ occurredAt }) => ({ patch: { state: "COMPLETED", completed_at: occurredAt, completion_summary: summary }, historyDetails: { completion_summary: summary } }) });
}
export async function cancelSecretaryEventCoordination({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 2000); if (!reason) throw new Error("SECRETARY_EVENT_COORDINATION_CANCEL_REASON_REQUIRED");
  return mutateEvent({ context, payload, instruction: "Cancel only the parent Secretary event coordination record; do not cancel or mutate linked child workflows.", eventName: "EVENT_COORDINATION_CANCELLED", allowedStates: ACTIVE_STATES, producer: async ({ occurredAt }) => ({ patch: { state: "CANCELLED", cancelled_at: occurredAt, cancellation_reason: reason }, historyDetails: { reason } }) });
}
export async function readSecretaryEventCoordination({ context, payload = {} } = {}) { const organization = organizationId(context); actorPartyId(context); const coordinationId = text(payload.coordination_id || payload.coordinationId, 120); if (!coordinationId) throw new Error("SECRETARY_EVENT_COORDINATION_ID_REQUIRED"); const task = await readTask(organization, coordinationId); return { status: "completed", contract: CONTRACT, coordination: task, record: registerFromTask(task), ...safetyFlags() }; }
export async function listSecretaryEventCoordinations({ context, payload = {} } = {}) {
  const organization = organizationId(context); actorPartyId(context); const includeTerminal = payload.include_terminal === true || payload.includeTerminal === true; const limit = Math.max(1, Math.min(Number(payload.limit) || 50, 200));
  let query = supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("source", SOURCE).order("created_at", { ascending: false }).limit(limit); if (!includeTerminal) query = query.eq("status", "IN_PROGRESS");
  const tasks = await many(query); return { status: "completed", contract: CONTRACT, coordinations: tasks.map((task) => ({ coordination: task, record: registerFromTask(task) })), ...safetyFlags() };
}

export default Object.freeze({ start: startSecretaryEventCoordination, linkComponent: linkSecretaryEventComponent, unlinkComponent: unlinkSecretaryEventComponent, linkReference: linkSecretaryEventReference, unlinkReference: unlinkSecretaryEventReference, refresh: refreshSecretaryEventCoordination, markReady: markSecretaryEventReady, reopen: reopenSecretaryEventCoordination, complete: completeSecretaryEventCoordination, cancel: cancelSecretaryEventCoordination, read: readSecretaryEventCoordination, list: listSecretaryEventCoordinations });