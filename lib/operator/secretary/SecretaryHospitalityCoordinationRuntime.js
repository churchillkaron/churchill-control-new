import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_HOSPITALITY_COORDINATION_V1";
const SOURCE = "secretary_hospitality_coordination";
const REGISTER_KEY = "hospitality_coordination_v1";
const KINDS = new Set(["REFRESHMENTS", "CATERING", "BEVERAGE_SERVICE", "ROOM_AMENITIES", "ACCESSIBILITY_SUPPORT", "GUEST_COMFORT", "OTHER"]);
const ITEM_STATES = new Set(["PENDING", "AVAILABILITY_REQUESTED", "CONFIRMED", "DELIVERED", "UNAVAILABLE", "NOT_REQUIRED"]);
const MUTABLE_STATES = new Set(["DRAFT", "READY_FOR_EVENT"]);

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function organizationId(context = {}) { const id = text(context.organizationId, 120); if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED"); return id; }
function actorPartyId(context = {}) { const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120); if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED"); return id; }
function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) { if (required) throw new Error(`SECRETARY_HOSPITALITY_${field.toUpperCase()}_REQUIRED`); return null; }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_HOSPITALITY_${field.toUpperCase()}_INVALID`);
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
    headcount_inferred: false,
    dietary_requirement_inferred: false,
    accessibility_requirement_inferred: false,
    service_confirmation_inferred: false,
    delivery_inferred: false,
    service_quality_inferred: false,
    catering_ordered: false,
    purchase_performed: false,
    order_placed: false,
    quote_accepted: false,
    vendor_terms_accepted: false,
    service_authorized_by_secretary: false,
    resource_reserved: false,
    calendar_event_created: false,
    calendar_event_modified: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}
async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function many(result) { const resolved = await result; if (resolved.error) throw resolved.error; return Array.isArray(resolved.data) ? resolved.data : []; }
function normalizeKind(value) { const kind = text(value || "OTHER", 80).toUpperCase(); if (!KINDS.has(kind)) throw new Error("SECRETARY_HOSPITALITY_ITEM_KIND_INVALID"); return kind; }
function normalizeItemState(value) { const state = text(value, 80).toUpperCase(); if (!ITEM_STATES.has(state)) throw new Error("SECRETARY_HOSPITALITY_ITEM_STATE_INVALID"); return state; }

async function routingFor({ context, instruction, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({ organizationId: organization, ownerPartyId: owner, scope: "TASK_ROUTING", instruction, at, requiresOwnerAuthority: false });
  if (routing.coverage_routing_review_required === true) throw new Error(`SECRETARY_HOSPITALITY_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_HOSPITALITY_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function ensureParty(organization, partyId, field) {
  const id = text(partyId, 120);
  if (!id) return null;
  const party = await one(supabaseAdmin.from("parties").select("id,display_name,email,phone,status").eq("organization_id", organization).eq("id", id).maybeSingle());
  if (!party) throw new Error(`SECRETARY_HOSPITALITY_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return party;
}

async function preferredActionType(organization, partyId) {
  if (!partyId) return "REVIEW";
  const profile = await one(supabaseAdmin.from("secretary_contact_profiles").select("preferred_channel,allow_calls,allow_messages").eq("organization_id", organization).eq("party_id", partyId).maybeSingle());
  const preferred = text(profile?.preferred_channel, 80).toLowerCase();
  if (preferred.includes("email")) return "EMAIL";
  if (profile?.allow_messages !== false) return "MESSAGE";
  if (profile?.allow_calls !== false) return "CALL";
  return "REVIEW";
}

async function resolveCalendarEvent(organization, calendarEventId) {
  const id = text(calendarEventId, 120);
  if (!id) return null;
  const event = await one(supabaseAdmin.from("secretary_calendar_events").select("id,title,status,starts_at,ends_at,timezone,location").eq("organization_id", organization).eq("id", id).maybeSingle());
  if (!event) throw new Error("SECRETARY_HOSPITALITY_CALENDAR_EVENT_NOT_FOUND");
  if (event.status === "CANCELLED") throw new Error("SECRETARY_HOSPITALITY_CALENDAR_EVENT_CANCELLED");
  return event;
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_HOSPITALITY_RECORD_INVALID");
  return { ...register, items: list(register.items), quotes: list(register.quotes), history: list(register.history), frozen_versions: list(register.frozen_versions) };
}
async function readTask(organization, coordinationId) {
  const task = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("id", coordinationId).maybeSingle());
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_HOSPITALITY_NOT_FOUND");
  return task;
}
function coordinationIdFor({ organization, title, startsAt, evidenceId }) { return deterministicUuid(`avantiqo-secretary-hospitality-v1:${organization}:${title}:${startsAt}:${evidenceId}`); }
function itemIdFor(coordinationId, index, kind, label) { return deterministicUuid(`avantiqo-secretary-hospitality-item-v1:${coordinationId}:${index}:${kind}:${label}`); }
function followUpId(taskId, item) { return deterministicUuid(`avantiqo-secretary-hospitality-follow-up-v1:${taskId}:${item.item_id}:${item.state}:${item.due_at || "none"}:${item.responsible_party_id || "internal"}`); }

function readiness(register) {
  const required = list(register.items).filter((item) => item.required !== false);
  const incomplete = required.filter((item) => !["CONFIRMED", "DELIVERED", "NOT_REQUIRED"].includes(item.state));
  const deliveryIncomplete = required.filter((item) => !["DELIVERED", "NOT_REQUIRED"].includes(item.state));
  return {
    required_items_incomplete: incomplete,
    delivery_items_incomplete: deliveryIncomplete,
    administrative_readiness_complete: incomplete.length === 0,
    delivery_evidence_complete: deliveryIncomplete.length === 0,
  };
}
function response(task, register, extra = {}) { return { status: "completed", contract: CONTRACT, coordination: task, record: register, ...readiness(register), ...extra, ...safetyFlags() }; }

async function cancelItemFollowUps(task, itemId, reason) {
  const rows = await many(supabaseAdmin.from("secretary_follow_ups").select("id,metadata").eq("organization_id", task.organization_id).eq("task_id", task.id).eq("status", "PENDING").limit(500));
  const ids = rows.filter((row) => object(row.metadata).secretary_hospitality_coordination_contract === CONTRACT && object(row.metadata).hospitality_item_id === itemId).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups").update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now }).eq("organization_id", task.organization_id).in("id", ids);
  if (result.error) throw result.error;
  return ids;
}
async function cancelAllFollowUps(task, reason) {
  const rows = await many(supabaseAdmin.from("secretary_follow_ups").select("id,metadata").eq("organization_id", task.organization_id).eq("task_id", task.id).eq("status", "PENDING").limit(500));
  const ids = rows.filter((row) => object(row.metadata).secretary_hospitality_coordination_contract === CONTRACT).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups").update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now }).eq("organization_id", task.organization_id).in("id", ids);
  if (result.error) throw result.error;
  return ids;
}

async function ensureFollowUp({ task, register, item, actor, routing }) {
  if (!item.due_at || ["CONFIRMED", "DELIVERED", "NOT_REQUIRED"].includes(item.state)) return null;
  const id = followUpId(task.id, item);
  const existing = await one(supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", task.organization_id).eq("id", id).maybeSingle());
  if (existing) return existing;
  const actionType = await preferredActionType(task.organization_id, item.responsible_party_id);
  const instruction = [
    `Coordinate hospitality requirement \"${item.label}\" for \"${register.title}\".`,
    `Event time: ${register.starts_at} to ${register.ends_at} (${register.timezone}).`,
    register.location ? `Location: ${register.location}.` : null,
    `Current status: ${item.state}.`,
    item.requirement_source_reference ? `Requirement source: ${item.requirement_source_reference}.` : null,
    "Ask only for availability, confirmation, delivery/setup evidence, or an exception update as appropriate.",
    "Do not place an order, accept a quote or terms, authorize service, commit spend, pay, sign, reserve a resource, or treat silence as confirmation.",
  ].filter(Boolean).join(" ");
  return one(supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id,
    owner_party_id: register.operational_assignee_party_id || task.owner_party_id,
    contact_party_id: item.responsible_party_id || null,
    task_id: task.id,
    calendar_event_id: register.calendar_event_id || null,
    action_type: actionType,
    reason: instruction,
    status: "PENDING",
    due_at: item.due_at,
    created_by_party_id: actor,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: Boolean(item.responsible_party_id) && actionType !== "REVIEW",
      execution_instruction: instruction,
      secretary_owned: true,
      secretary_hospitality_coordination: true,
      secretary_hospitality_coordination_contract: CONTRACT,
      hospitality_coordination_id: task.id,
      hospitality_item_id: item.item_id,
      canonical_owner_party_id: register.canonical_owner_party_id,
      requires_owner_authority: false,
      ...secretaryAdministrativeCoverageMetadata(routing),
      ...safetyFlags(),
    },
  }).select("*").single());
}

async function mutate({ context, payload, eventName, instruction, allowedStates = MUTABLE_STATES, producer }) {
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_HOSPITALITY_COORDINATION_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_HOSPITALITY_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_HOSPITALITY_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = payloadHash(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, coordinationId);
    const register = registerFromTask(task);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) {
      if (replay.event === eventName && replay.payload_sha256 === hash) return response(task, register, { replay_safe: true });
      throw new Error("SECRETARY_HOSPITALITY_EVIDENCE_REUSE_CONFLICT");
    }
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_HOSPITALITY_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_HOSPITALITY_STALE_VERSION");
    const produced = await producer({ task, register, auth, occurredAt, evidenceId, hash });
    const next = {
      ...register,
      ...object(produced.patch),
      contract: CONTRACT,
      version: expectedVersion + 1,
      history: [...register.history, { event: eventName, evidence_id: evidenceId, occurred_at: occurredAt, recorded_by_party_id: auth.actor, payload_sha256: hash, ...object(produced.historyDetails), ...safetyFlags() }].slice(-500),
      ...safetyFlags(),
    };
    const terminal = ["COMPLETED", "CANCELLED"].includes(next.state);
    const updatedResult = await supabaseAdmin.from("secretary_tasks").update({
      status: next.state === "CANCELLED" ? "CANCELLED" : next.state === "COMPLETED" ? "DONE" : "IN_PROGRESS",
      completed_at: terminal ? occurredAt : null,
      metadata: { ...object(task.metadata), [REGISTER_KEY]: next, secretary_hospitality_coordination_contract: CONTRACT, secretary_hospitality_coordination_state: next.state, ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() },
      updated_at: new Date().toISOString(),
    }).eq("organization_id", auth.organization).eq("id", task.id).eq("updated_at", task.updated_at).select("*").maybeSingle();
    if (updatedResult.error) throw updatedResult.error;
    if (!updatedResult.data) continue;
    if (produced.cancel_item_follow_ups) await cancelItemFollowUps(updatedResult.data, produced.cancel_item_follow_ups, "Hospitality requirement has explicit terminal/settled evidence.");
    if (terminal) await cancelAllFollowUps(updatedResult.data, "Hospitality coordination reached terminal state.");
    return response(updatedResult.data, next, { replay_safe: false });
  }
  throw new Error("SECRETARY_HOSPITALITY_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryHospitalityCoordination({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_HOSPITALITY_EVIDENCE_REQUIRED");
  const startedAt = iso(payload.started_at || payload.startedAt, "started_at");
  const auth = await routingFor({ context, instruction: "Start event or meeting hospitality coordination", at: startedAt });
  const calendarEvent = await resolveCalendarEvent(auth.organization, payload.calendar_event_id || payload.calendarEventId);
  const title = text(payload.title || calendarEvent?.title, 600);
  if (!title) throw new Error("SECRETARY_HOSPITALITY_TITLE_REQUIRED");
  const startsAt = iso(payload.starts_at || payload.startsAt || calendarEvent?.starts_at, "starts_at");
  const endsAt = iso(payload.ends_at || payload.endsAt || calendarEvent?.ends_at, "ends_at");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_HOSPITALITY_TIME_RANGE_INVALID");
  const timezone = text(payload.timezone || calendarEvent?.timezone || context.timezone || "UTC", 120) || "UTC";
  const location = text(payload.location || calendarEvent?.location, 1000) || null;
  const expectedHeadcount = Number(payload.expected_headcount ?? payload.expectedHeadcount);
  if (!Number.isInteger(expectedHeadcount) || expectedHeadcount < 0) throw new Error("SECRETARY_HOSPITALITY_EXPECTED_HEADCOUNT_REQUIRED");
  const rawItems = list(payload.items);
  if (!rawItems.length) throw new Error("SECRETARY_HOSPITALITY_ITEMS_REQUIRED");
  const coordinationId = coordinationIdFor({ organization: auth.organization, title, startsAt, evidenceId });
  const existing = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", auth.organization).eq("id", coordinationId).maybeSingle());
  if (existing) return response(existing, registerFromTask(existing), { replay_safe: true });

  const items = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const raw = object(rawItems[index]);
    const kind = normalizeKind(raw.kind);
    const label = text(raw.label, 800);
    if (!label) throw new Error("SECRETARY_HOSPITALITY_ITEM_LABEL_REQUIRED");
    const requirementSourceReference = text(raw.requirement_source_reference || raw.requirementSourceReference, 1200);
    if (!requirementSourceReference) throw new Error("SECRETARY_HOSPITALITY_REQUIREMENT_SOURCE_REQUIRED");
    const responsible = await ensureParty(auth.organization, raw.responsible_party_id || raw.responsiblePartyId, "responsible");
    items.push({
      item_id: itemIdFor(coordinationId, index, kind, label),
      kind,
      label,
      required: raw.required !== false,
      state: "PENDING",
      quantity: raw.quantity == null ? null : text(raw.quantity, 200),
      responsible_party_id: responsible?.id || null,
      due_at: iso(raw.due_at || raw.dueAt, "item_due_at", false),
      requirement_source_reference: requirementSourceReference,
      status_source_reference: null,
      status_evidence_id: null,
      status_occurred_at: null,
      history: [],
      ...safetyFlags(),
    });
  }
  const specialRequirements = list(payload.special_requirements || payload.specialRequirements).map((value) => text(value, 1200)).filter(Boolean).slice(0, 100);
  const register = {
    contract: CONTRACT,
    coordination_id: coordinationId,
    state: "DRAFT",
    version: 1,
    title,
    calendar_event_id: calendarEvent?.id || null,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    location,
    expected_headcount: expectedHeadcount,
    special_requirements: specialRequirements,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    items,
    quotes: [],
    frozen_versions: [],
    history: [{ event: "STARTED", evidence_id: evidenceId, occurred_at: startedAt, recorded_by_party_id: auth.actor, payload_sha256: payloadHash(payload), ...safetyFlags() }],
    ...safetyFlags(),
  };
  const task = await one(supabaseAdmin.from("secretary_tasks").insert({
    id: coordinationId,
    organization_id: auth.organization,
    owner_party_id: auth.operational,
    calendar_event_id: calendarEvent?.id || null,
    title: `Hospitality: ${title}`,
    details: `Evidence-backed hospitality coordination for ${title}`,
    status: "IN_PROGRESS",
    priority: "NORMAL",
    due_at: startsAt,
    source: SOURCE,
    created_by_party_id: auth.actor,
    metadata: { [REGISTER_KEY]: register, secretary_hospitality_coordination_contract: CONTRACT, secretary_hospitality_coordination_state: register.state, ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() },
  }).select("*").single());
  return response(task, register, { replay_safe: false });
}

export async function recordSecretaryHospitalityItemStatus({ context, payload = {} } = {}) {
  const itemId = text(payload.item_id || payload.itemId, 120);
  if (!itemId) throw new Error("SECRETARY_HOSPITALITY_ITEM_ID_REQUIRED");
  const state = normalizeItemState(payload.state);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1200);
  if (["CONFIRMED", "DELIVERED", "UNAVAILABLE", "NOT_REQUIRED"].includes(state) && !sourceReference) throw new Error("SECRETARY_HOSPITALITY_STATUS_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "ITEM_STATUS_RECORDED",
    instruction: `Record hospitality item status ${state}`,
    producer: async ({ register, occurredAt, evidenceId }) => {
      const index = register.items.findIndex((item) => item.item_id === itemId);
      if (index < 0) throw new Error("SECRETARY_HOSPITALITY_ITEM_NOT_FOUND");
      const previous = register.items[index];
      const nextItem = {
        ...previous,
        state,
        status_source_reference: sourceReference || previous.status_source_reference || null,
        status_evidence_id: evidenceId,
        status_occurred_at: occurredAt,
        history: [...list(previous.history), { state: previous.state, status_source_reference: previous.status_source_reference || null, status_evidence_id: previous.status_evidence_id || null, status_occurred_at: previous.status_occurred_at || null }].slice(-25),
        ...safetyFlags(),
      };
      const items = [...register.items];
      items[index] = nextItem;
      const requiredIncomplete = items.filter((item) => item.required !== false && !["CONFIRMED", "DELIVERED", "NOT_REQUIRED"].includes(item.state));
      return {
        patch: { items, state: register.state === "READY_FOR_EVENT" && requiredIncomplete.length ? "DRAFT" : register.state },
        cancel_item_follow_ups: ["CONFIRMED", "DELIVERED", "NOT_REQUIRED"].includes(state) ? itemId : null,
        historyDetails: { item_id: itemId, item_state: state, source_reference: sourceReference || null },
      };
    },
  });
}

export async function recordSecretaryHospitalityQuote({ context, payload = {} } = {}) {
  const itemId = text(payload.item_id || payload.itemId, 120);
  if (!itemId) throw new Error("SECRETARY_HOSPITALITY_ITEM_ID_REQUIRED");
  const quoteReference = text(payload.quote_reference || payload.quoteReference, 1200);
  if (!quoteReference) throw new Error("SECRETARY_HOSPITALITY_QUOTE_REFERENCE_REQUIRED");
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("SECRETARY_HOSPITALITY_QUOTE_AMOUNT_INVALID");
  const currency = text(payload.currency, 20).toUpperCase();
  if (!currency) throw new Error("SECRETARY_HOSPITALITY_QUOTE_CURRENCY_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "QUOTE_RECORDED",
    instruction: "Record hospitality quote as informational evidence only",
    producer: async ({ register, auth, occurredAt, evidenceId }) => {
      if (!register.items.some((item) => item.item_id === itemId)) throw new Error("SECRETARY_HOSPITALITY_ITEM_NOT_FOUND");
      const provider = await ensureParty(auth.organization, payload.provider_party_id || payload.providerPartyId, "provider");
      const quote = { quote_id: deterministicUuid(`avantiqo-secretary-hospitality-quote-v1:${register.coordination_id}:${evidenceId}`), item_id: itemId, provider_party_id: provider?.id || null, quote_reference: quoteReference, amount, currency, valid_until: iso(payload.valid_until || payload.validUntil, "quote_valid_until", false), evidence_id: evidenceId, occurred_at: occurredAt, informational_only: true, quote_accepted: false, vendor_terms_accepted: false };
      return { patch: { quotes: [...register.quotes, quote].slice(-100) }, historyDetails: { item_id: itemId, quote_id: quote.quote_id, informational_only: true } };
    },
  });
}

export async function refreshSecretaryHospitalityFollowUps({ context, payload = {} } = {}) {
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_HOSPITALITY_COORDINATION_ID_REQUIRED");
  const organization = organizationId(context);
  const task = await readTask(organization, coordinationId);
  const register = registerFromTask(task);
  if (!MUTABLE_STATES.has(register.state)) throw new Error(`SECRETARY_HOSPITALITY_STATE_INVALID:${register.state}`);
  const auth = await routingFor({ context, instruction: "Refresh hospitality follow-ups", at: new Date().toISOString() });
  const rows = [];
  for (const item of register.items) {
    const row = await ensureFollowUp({ task, register, item, actor: auth.actor, routing: auth.routing });
    if (row) rows.push(row);
  }
  return response(task, register, { follow_up_count: rows.length, follow_up_ids: rows.map((row) => row.id) });
}

export async function finalizeSecretaryHospitalityReadiness({ context, payload = {} } = {}) {
  return mutate({
    context,
    payload,
    eventName: "READINESS_FINALIZED",
    instruction: "Finalize evidence-backed hospitality readiness",
    allowedStates: new Set(["DRAFT"]),
    producer: async ({ register, occurredAt, evidenceId }) => {
      const incomplete = readiness(register).required_items_incomplete;
      if (incomplete.length) throw new Error("SECRETARY_HOSPITALITY_REQUIRED_ITEMS_INCOMPLETE");
      const frozen = { version: register.version + 1, finalized_at: occurredAt, evidence_id: evidenceId, expected_headcount: register.expected_headcount, special_requirements: register.special_requirements, items: register.items.map((item) => ({ ...item })) };
      return { patch: { state: "READY_FOR_EVENT", frozen_versions: [...register.frozen_versions, frozen].slice(-25) }, historyDetails: { frozen_version: frozen.version } };
    },
  });
}

export async function reopenSecretaryHospitalityReadiness({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1200);
  if (!reason) throw new Error("SECRETARY_HOSPITALITY_REOPEN_REASON_REQUIRED");
  return mutate({ context, payload, eventName: "READINESS_REOPENED", instruction: "Reopen hospitality readiness for evidenced revision", allowedStates: new Set(["READY_FOR_EVENT"]), producer: async () => ({ patch: { state: "DRAFT" }, historyDetails: { reason } }) });
}

export async function completeSecretaryHospitalityCoordination({ context, payload = {} } = {}) {
  return mutate({
    context,
    payload,
    eventName: "COORDINATION_COMPLETED",
    instruction: "Complete hospitality coordination from explicit delivery/setup evidence",
    allowedStates: new Set(["READY_FOR_EVENT"]),
    producer: async ({ register }) => {
      const incomplete = readiness(register).delivery_items_incomplete;
      if (incomplete.length) throw new Error("SECRETARY_HOSPITALITY_DELIVERY_EVIDENCE_INCOMPLETE");
      return { patch: { state: "COMPLETED" }, historyDetails: { delivery_evidence_complete: true } };
    },
  });
}

export async function cancelSecretaryHospitalityCoordination({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1200);
  if (!reason) throw new Error("SECRETARY_HOSPITALITY_CANCEL_REASON_REQUIRED");
  return mutate({ context, payload, eventName: "COORDINATION_CANCELLED", instruction: "Cancel Secretary hospitality coordination only", allowedStates: new Set(["DRAFT", "READY_FOR_EVENT"]), producer: async () => ({ patch: { state: "CANCELLED" }, historyDetails: { reason } }) });
}

export async function readSecretaryHospitalityCoordination({ context, payload = {} } = {}) {
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_HOSPITALITY_COORDINATION_ID_REQUIRED");
  const task = await readTask(organizationId(context), coordinationId);
  return response(task, registerFromTask(task));
}

export async function listSecretaryHospitalityCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const limit = Math.max(1, Math.min(200, Number(payload.limit) || 50));
  const rows = await many(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("source", SOURCE).order("created_at", { ascending: false }).limit(limit));
  return { status: "completed", contract: CONTRACT, items: rows.map((task) => ({ task, record: registerFromTask(task), ...readiness(registerFromTask(task)) })), ...safetyFlags() };
}

export default Object.freeze({
  start: startSecretaryHospitalityCoordination,
  recordStatus: recordSecretaryHospitalityItemStatus,
  recordQuote: recordSecretaryHospitalityQuote,
  refresh: refreshSecretaryHospitalityFollowUps,
  finalize: finalizeSecretaryHospitalityReadiness,
  reopen: reopenSecretaryHospitalityReadiness,
  complete: completeSecretaryHospitalityCoordination,
  cancel: cancelSecretaryHospitalityCoordination,
  read: readSecretaryHospitalityCoordination,
  list: listSecretaryHospitalityCoordination,
});
