import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_RESOURCE_RESERVATION_V1";
const SOURCE = "secretary_resource_reservation";
const REGISTER_KEY = "resource_reservation_v1";
const RESOURCE_TYPES = new Set(["ROOM", "EQUIPMENT", "VEHICLE", "DESK", "SPACE", "OTHER"]);

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
  if (!raw) throw new Error(`SECRETARY_RESOURCE_RESERVATION_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_RESOURCE_RESERVATION_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeResourceType(value) {
  const type = text(value || "OTHER", 80).toUpperCase();
  if (!RESOURCE_TYPES.has(type)) throw new Error("SECRETARY_RESOURCE_RESERVATION_RESOURCE_TYPE_INVALID");
  return type;
}

function normalizeResourceKey(value) {
  const key = text(value, 500).toLowerCase();
  if (!key) throw new Error("SECRETARY_RESOURCE_RESERVATION_RESOURCE_KEY_REQUIRED");
  return key;
}

function normalizeCapacity(value) {
  if (value === undefined || value === null || value === "") return null;
  const capacity = Number(value);
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error("SECRETARY_RESOURCE_RESERVATION_CAPACITY_INVALID");
  return capacity;
}

function safetyFlags() {
  return {
    atomic_overlap_enforced: true,
    external_booking_performed: false,
    calendar_event_created: false,
    calendar_event_modified: false,
    room_setup_performed: false,
    purchase_performed: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throwMappedError(resolved.error);
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throwMappedError(resolved.error);
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function throwMappedError(error) {
  const message = text(error?.message || error?.details || error, 1600);
  const known = [
    "SECRETARY_RESOURCE_RESERVATION_SLOT_UNAVAILABLE",
    "SECRETARY_RESOURCE_RESERVATION_STALE_VERSION",
    "SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REUSE_CONFLICT",
    "SECRETARY_RESOURCE_RESERVATION_NOT_FOUND",
    "SECRETARY_RESOURCE_RESERVATION_STATE_INVALID",
    "SECRETARY_RESOURCE_RESERVATION_CALENDAR_EVENT_NOT_FOUND",
    "SECRETARY_RESOURCE_RESERVATION_ID_CONFLICT",
  ];
  const match = known.find((value) => message.includes(value));
  if (match) {
    const mapped = new Error(match);
    if (match === "SECRETARY_RESOURCE_RESERVATION_SLOT_UNAVAILABLE") mapped.status = 409;
    throw mapped;
  }
  throw error;
}

async function routingFor({ context, at, instruction }) {
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
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_RESOURCE_RESERVATION_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_RESOURCE_RESERVATION_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_RESOURCE_RESERVATION_RECORD_INVALID");
  return { ...register, history: list(register.history) };
}

async function readTask({ organization, reservationId }) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", reservationId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_RESOURCE_RESERVATION_NOT_FOUND");
  return task;
}

function mergeRuntimeMetadata(task, routing) {
  const metadata = object(task.metadata);
  const register = registerFromTask(task);
  return {
    ...metadata,
    [REGISTER_KEY]: register,
    secretary_resource_reservation: true,
    secretary_resource_reservation_contract: CONTRACT,
    secretary_resource_reservation_state: register.state,
    ledger_task_is_execution_work: false,
    ...secretaryAdministrativeCoverageMetadata(routing),
    ...safetyFlags(),
  };
}

async function persistRoutingMetadata(task, routing) {
  const metadata = mergeRuntimeMetadata(task, routing);
  const updated = await one(
    supabaseAdmin.from("secretary_tasks")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("organization_id", task.organization_id)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle(),
  );
  return updated || task;
}

function reservationPayload({ resourceKey, resourceName, resourceType, startsAt, endsAt, timezone, purpose, location, capacity, calendarEventId, evidenceId, occurredAt }) {
  return {
    resource_key: resourceKey,
    resource_name: resourceName,
    resource_type: resourceType,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    purpose,
    location,
    capacity,
    calendar_event_id: calendarEventId,
    evidence_id: evidenceId,
    occurred_at: occurredAt,
  };
}

export async function reserveSecretaryResource({ context, payload = {} } = {}) {
  const resourceKey = normalizeResourceKey(payload.resource_key || payload.resourceKey);
  const resourceName = text(payload.resource_name || payload.resourceName, 500) || resourceKey;
  const resourceType = normalizeResourceType(payload.resource_type || payload.resourceType);
  const startsAt = iso(payload.starts_at || payload.startsAt, "starts_at");
  const endsAt = iso(payload.ends_at || payload.endsAt, "ends_at");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_RESOURCE_RESERVATION_WINDOW_INVALID");
  const timezone = text(payload.timezone || context.timezone, 120) || "UTC";
  const purpose = text(payload.purpose, 2000) || null;
  const location = text(payload.location, 1000) || null;
  const capacity = normalizeCapacity(payload.capacity);
  const calendarEventId = text(payload.calendar_event_id || payload.calendarEventId, 120) || null;
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REQUIRED");
  const reservedAt = iso(payload.reserved_at || payload.reservedAt, "reserved_at");
  const auth = await routingFor({
    context,
    at: reservedAt,
    instruction: `Reserve internal resource ${resourceName} from ${startsAt} until ${endsAt}. This is an Avantiqo-internal allocation only, not a hotel/travel/external booking.`,
  });
  const body = reservationPayload({ resourceKey, resourceName, resourceType, startsAt, endsAt, timezone, purpose, location, capacity, calendarEventId, evidenceId, occurredAt: reservedAt });
  const payloadHash = sha256(JSON.stringify(body));
  const reservationId = deterministicUuid(`avantiqo-secretary-resource-reservation-v1:${auth.organization}:${evidenceId}`);

  const task = await one(supabaseAdmin.rpc("secretary_reserve_resource_slot", {
    p_reservation_id: reservationId,
    p_organization_id: auth.organization,
    p_entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    p_owner_party_id: auth.operational,
    p_canonical_owner_party_id: auth.owner,
    p_calendar_event_id: calendarEventId,
    p_resource_key: resourceKey,
    p_resource_name: resourceName,
    p_resource_type: resourceType,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_timezone: timezone,
    p_purpose: purpose,
    p_location: location,
    p_capacity: capacity,
    p_evidence_id: evidenceId,
    p_payload_sha256: payloadHash,
    p_reserved_at: reservedAt,
    p_created_by_party_id: auth.actor,
  }));

  const routed = await persistRoutingMetadata(task, auth.routing);
  const record = registerFromTask(routed);
  const first = record.history[0] || {};
  const replaySafe = first.evidence_id === evidenceId && first.payload_sha256 === payloadHash && routed.created_at !== routed.updated_at;
  return { status: "reserved", contract: CONTRACT, reservation: routed, record, replay_safe: replaySafe, ...safetyFlags() };
}

export async function changeSecretaryResourceReservation({ context, payload = {} } = {}) {
  const reservationId = text(payload.reservation_id || payload.reservationId, 120);
  if (!reservationId) throw new Error("SECRETARY_RESOURCE_RESERVATION_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_RESOURCE_RESERVATION_EXPECTED_VERSION_REQUIRED");
  const startsAt = iso(payload.starts_at || payload.startsAt, "starts_at");
  const endsAt = iso(payload.ends_at || payload.endsAt, "ends_at");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_RESOURCE_RESERVATION_WINDOW_INVALID");
  const timezone = text(payload.timezone || context.timezone, 120) || "UTC";
  const purpose = text(payload.purpose, 2000) || null;
  const location = text(payload.location, 1000) || null;
  const capacity = normalizeCapacity(payload.capacity);
  const calendarEventId = text(payload.calendar_event_id || payload.calendarEventId, 120) || null;
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REQUIRED");
  const changedAt = iso(payload.changed_at || payload.changedAt, "changed_at");
  const auth = await routingFor({ context, at: changedAt, instruction: `Change an existing internal resource reservation to ${startsAt} through ${endsAt}. Do not modify any linked calendar event.` });
  const payloadHash = sha256(JSON.stringify({ reservationId, expectedVersion, startsAt, endsAt, timezone, purpose, location, capacity, calendarEventId, evidenceId, changedAt }));

  const task = await one(supabaseAdmin.rpc("secretary_change_resource_slot", {
    p_organization_id: auth.organization,
    p_reservation_id: reservationId,
    p_expected_version: expectedVersion,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_timezone: timezone,
    p_purpose: purpose,
    p_location: location,
    p_capacity: capacity,
    p_calendar_event_id: calendarEventId,
    p_evidence_id: evidenceId,
    p_payload_sha256: payloadHash,
    p_changed_at: changedAt,
    p_changed_by_party_id: auth.actor,
  }));
  const routed = await persistRoutingMetadata(task, auth.routing);
  return { status: "changed", contract: CONTRACT, reservation: routed, record: registerFromTask(routed), ...safetyFlags() };
}

export async function releaseSecretaryResourceReservation({ context, payload = {} } = {}) {
  const reservationId = text(payload.reservation_id || payload.reservationId, 120);
  if (!reservationId) throw new Error("SECRETARY_RESOURCE_RESERVATION_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_RESOURCE_RESERVATION_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REQUIRED");
  const reason = text(payload.reason, 2000);
  if (!reason) throw new Error("SECRETARY_RESOURCE_RESERVATION_RELEASE_REASON_REQUIRED");
  const releasedAt = iso(payload.released_at || payload.releasedAt, "released_at");
  const auth = await routingFor({ context, at: releasedAt, instruction: "Release only the internal Avantiqo resource allocation. Do not cancel any linked meeting, calendar event, vendor booking, or room setup task." });
  const payloadHash = sha256(JSON.stringify({ reservationId, expectedVersion, evidenceId, reason, releasedAt }));

  const task = await one(supabaseAdmin.rpc("secretary_release_resource_slot", {
    p_organization_id: auth.organization,
    p_reservation_id: reservationId,
    p_expected_version: expectedVersion,
    p_evidence_id: evidenceId,
    p_payload_sha256: payloadHash,
    p_released_at: releasedAt,
    p_reason: reason,
    p_released_by_party_id: auth.actor,
  }));
  const routed = await persistRoutingMetadata(task, auth.routing);
  return { status: "released", contract: CONTRACT, reservation: routed, record: registerFromTask(routed), ...safetyFlags() };
}

export async function readSecretaryResourceReservation({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const reservationId = text(payload.reservation_id || payload.reservationId, 120);
  if (!reservationId) throw new Error("SECRETARY_RESOURCE_RESERVATION_ID_REQUIRED");
  const task = await readTask({ organization, reservationId });
  return { status: "completed", contract: CONTRACT, reservation: task, record: registerFromTask(task), ...safetyFlags() };
}

export async function listSecretaryResourceReservations({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const includeReleased = payload.include_released === true || payload.includeReleased === true;
  const resourceKey = text(payload.resource_key || payload.resourceKey, 500).toLowerCase();
  const resourceType = text(payload.resource_type || payload.resourceType, 80).toUpperCase();
  const from = payload.from ? iso(payload.from, "from") : null;
  const to = payload.to ? iso(payload.to, "to") : null;
  if (from && to && Date.parse(to) <= Date.parse(from)) throw new Error("SECRETARY_RESOURCE_RESERVATION_WINDOW_INVALID");
  const rawLimit = Number(payload.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(300, Math.floor(rawLimit))) : 100;
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeReleased) query = query.eq("status", "IN_PROGRESS");
  const rows = await many(query);
  const reservations = rows
    .map((reservation) => ({ reservation, record: registerFromTask(reservation) }))
    .filter(({ record }) => !resourceKey || record.resource_key === resourceKey)
    .filter(({ record }) => !resourceType || record.resource_type === resourceType)
    .filter(({ record }) => !from || Date.parse(record.ends_at) > Date.parse(from))
    .filter(({ record }) => !to || Date.parse(record.starts_at) < Date.parse(to));
  return { status: "completed", contract: CONTRACT, count: reservations.length, reservations, ...safetyFlags() };
}

export default Object.freeze({
  reserve: reserveSecretaryResource,
  change: changeSecretaryResourceReservation,
  release: releaseSecretaryResourceReservation,
  read: readSecretaryResourceReservation,
  list: listSecretaryResourceReservations,
});
