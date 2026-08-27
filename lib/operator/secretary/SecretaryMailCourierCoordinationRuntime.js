import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_MAIL_COURIER_COORDINATION_V1";
const SOURCE = "secretary_mail_courier";
const REGISTER_KEY = "mail_courier_coordination_v1";
const DIRECTIONS = new Set(["INBOUND", "OUTBOUND"]);
const ITEM_KINDS = new Set(["LETTER", "DOCUMENT", "PARCEL", "CARD", "PACKAGE", "OTHER"]);
const TERMINAL_STATES = new Set(["COLLECTED", "DELIVERED", "CANCELLED"]);

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
  if (!raw) throw new Error(`SECRETARY_MAIL_COURIER_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_MAIL_COURIER_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function optionalIso(value, field) {
  const raw = text(value, 180);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_MAIL_COURIER_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function uuidFromSeed(seed) {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function safetyFlags() {
  return {
    receipt_inferred: false,
    collection_inferred: false,
    dispatch_inferred: false,
    delivery_inferred: false,
    recipient_identity_verified: false,
    legal_acceptance_inferred: false,
    contractual_acceptance_inferred: false,
    customs_declaration_created: false,
    customs_declaration_submitted: false,
    carrier_booking_performed: false,
    postage_purchase_performed: false,
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

function normalizedDirection(value) {
  const direction = text(value, 40).toUpperCase();
  if (!DIRECTIONS.has(direction)) throw new Error("SECRETARY_MAIL_COURIER_DIRECTION_INVALID");
  return direction;
}

function normalizedItemKind(value) {
  const kind = text(value || "OTHER", 40).toUpperCase();
  if (!ITEM_KINDS.has(kind)) throw new Error("SECRETARY_MAIL_COURIER_ITEM_KIND_INVALID");
  return kind;
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
    throw new Error(`SECRETARY_MAIL_COURIER_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_MAIL_COURIER_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function eventEntry({ event, evidenceId, at, actor, details = {} }) {
  return {
    event,
    evidence_id: evidenceId,
    occurred_at: at,
    recorded_by_party_id: actor,
    ...object(details),
    ...safetyFlags(),
  };
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_MAIL_COURIER_RECORD_INVALID");
  return {
    ...register,
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
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_MAIL_COURIER_NOT_FOUND");
  return task;
}

async function ensureParty({ organization, partyId, field }) {
  const id = text(partyId, 120);
  if (!id) return null;
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,email,phone,party_type,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error(`SECRETARY_MAIL_COURIER_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return party;
}

async function upsertReviewFollowUp({ task, register, kind, dueAt, actor, routing, reason }) {
  if (!dueAt) return null;
  const id = uuidFromSeed(`${task.organization_id}|${task.id}|${kind}|${dueAt}`);
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
      owner_party_id: text(routing.operational_assignee_party_id, 120) || register.canonical_owner_party_id,
      contact_party_id: register.recipient_party_id || null,
      task_id: task.id,
      action_type: "REVIEW",
      reason,
      status: "PENDING",
      due_at: dueAt,
      created_by_party_id: actor,
      metadata: {
        secretary_mail_courier: true,
        secretary_mail_courier_contract: CONTRACT,
        mail_courier_kind: kind,
        coordination_id: task.id,
        canonical_owner_party_id: register.canonical_owner_party_id,
        execution_ready: false,
        ...secretaryAdministrativeCoverageMetadata(routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
}

async function cancelPendingFollowUps(task) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING"),
  );
  for (const row of rows) {
    const metadata = object(row.metadata);
    if (metadata.secretary_mail_courier !== true || metadata.secretary_mail_courier_contract !== CONTRACT) continue;
    const result = await supabaseAdmin.from("secretary_follow_ups")
      .update({ status: "CANCELLED", completed_at: new Date().toISOString(), result: "Mail/courier coordination reached terminal state.", updated_at: new Date().toISOString() })
      .eq("organization_id", task.organization_id)
      .eq("id", row.id)
      .eq("status", "PENDING");
    if (result.error) throw result.error;
  }
}

async function mutateCoordination({ context, payload, instruction, allowedStates, producer }) {
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_MAIL_COURIER_COORDINATION_ID_REQUIRED");
  const organization = organizationId(context);
  const current = await readTask({ organization, coordinationId });
  const at = iso(payload.occurred_at || payload.occurredAt || payload.recorded_at || payload.recordedAt || payload.received_at || payload.receivedAt || payload.routed_at || payload.routedAt || payload.handed_off_at || payload.handedOffAt || payload.dispatched_at || payload.dispatchedAt || payload.delivered_at || payload.deliveredAt || payload.cancelled_at || payload.cancelledAt, "occurred_at");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_MAIL_COURIER_EVIDENCE_REQUIRED");
  const auth = await routingFor({ context, instruction, at });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = attempt === 0 ? current : await readTask({ organization, coordinationId });
    const latest = registerFromTask(task);
    const replay = latest.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) {
      if (replay.event === producer.eventName) {
        return { status: "completed", contract: CONTRACT, coordination: task, record: latest, replay_safe: true, ...safetyFlags() };
      }
      throw new Error("SECRETARY_MAIL_COURIER_EVIDENCE_REUSE_CONFLICT");
    }
    if (TERMINAL_STATES.has(latest.state) && !allowedStates.has(latest.state)) {
      throw new Error("SECRETARY_MAIL_COURIER_ALREADY_TERMINAL");
    }
    if (!allowedStates.has(latest.state)) throw new Error(`SECRETARY_MAIL_COURIER_STATE_INVALID:${latest.state}`);
    const produced = await producer({ task, register: latest, auth, at, evidenceId });
    const next = {
      ...latest,
      ...object(produced.patch),
      contract: CONTRACT,
      history: [...latest.history, produced.historyEntry].slice(-500),
      ...safetyFlags(),
    };
    const terminal = TERMINAL_STATES.has(next.state);
    const metadata = {
      ...object(task.metadata),
      [REGISTER_KEY]: next,
      secretary_mail_courier_contract: CONTRACT,
      secretary_mail_courier_state: next.state,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      ...safetyFlags(),
    };
    const updated = await one(
      supabaseAdmin.from("secretary_tasks")
        .update({
          status: next.state === "CANCELLED" ? "CANCELLED" : terminal ? "DONE" : "IN_PROGRESS",
          completed_at: terminal ? at : null,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organization)
        .eq("id", coordinationId)
        .eq("updated_at", task.updated_at)
        .select("*")
        .maybeSingle(),
    );
    if (!updated) continue;
    if (terminal) await cancelPendingFollowUps(updated);
    if (produced.followUp) {
      await upsertReviewFollowUp({
        task: updated,
        register: next,
        kind: produced.followUp.kind,
        dueAt: produced.followUp.dueAt,
        actor: auth.actor,
        routing: auth.routing,
        reason: produced.followUp.reason,
      });
    }
    return { status: "completed", contract: CONTRACT, coordination: updated, record: next, replay_safe: false, ...safetyFlags() };
  }
  throw new Error("SECRETARY_MAIL_COURIER_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryMailCourierCoordination({ context, payload = {} } = {}) {
  const direction = normalizedDirection(payload.direction);
  const itemKind = normalizedItemKind(payload.item_kind || payload.itemKind);
  const description = text(payload.item_description || payload.itemDescription, 1500);
  if (!description) throw new Error("SECRETARY_MAIL_COURIER_ITEM_DESCRIPTION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_MAIL_COURIER_EVIDENCE_REQUIRED");
  const registeredAt = iso(payload.registered_at || payload.registeredAt, "registered_at");
  const auth = await routingFor({ context, instruction: `Register ${direction.toLowerCase()} mail or courier item for administrative coordination.`, at: registeredAt });
  const senderParty = await ensureParty({ organization: auth.organization, partyId: payload.sender_party_id || payload.senderPartyId, field: "sender" });
  const recipientParty = await ensureParty({ organization: auth.organization, partyId: payload.recipient_party_id || payload.recipientPartyId, field: "recipient" });
  const externalReference = text(payload.external_reference || payload.externalReference, 500) || null;
  const coordinationId = uuidFromSeed(`${auth.organization}|${direction}|${itemKind}|${description}|${evidenceId}|${registeredAt}`);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", auth.organization)
      .eq("id", coordinationId)
      .maybeSingle(),
  );
  if (existing) {
    const register = registerFromTask(existing);
    return { status: "registered", contract: CONTRACT, coordination: existing, record: register, replay_safe: true, ...safetyFlags() };
  }
  const state = "REGISTERED";
  const history = [eventEntry({ event: "REGISTERED", evidenceId, at: registeredAt, actor: auth.actor, details: { direction, item_kind: itemKind } })];
  const register = {
    contract: CONTRACT,
    coordination_id: coordinationId,
    direction,
    item_kind: itemKind,
    item_description: description,
    state,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    sender_party_id: senderParty?.id || null,
    recipient_party_id: recipientParty?.id || null,
    external_reference: externalReference,
    carrier_name: text(payload.carrier_name || payload.carrierName, 300) || null,
    tracking_reference: text(payload.tracking_reference || payload.trackingReference, 500) || null,
    custody_holder_party_id: null,
    registered_at: registeredAt,
    last_event_at: registeredAt,
    history,
    ...safetyFlags(),
  };
  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: coordinationId,
      organization_id: auth.organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: auth.operational,
      contact_party_id: recipientParty?.id || senderParty?.id || null,
      title: `Mail/courier: ${description.slice(0, 420)}`,
      details: `${direction} ${itemKind} coordination`,
      status: "OPEN",
      priority: "NORMAL",
      due_at: optionalIso(payload.next_check_at || payload.nextCheckAt, "next_check_at"),
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_mail_courier_contract: CONTRACT,
        secretary_mail_courier_state: state,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
  const nextCheckAt = optionalIso(payload.next_check_at || payload.nextCheckAt, "next_check_at");
  if (nextCheckAt) {
    await upsertReviewFollowUp({
      task,
      register,
      kind: "GENERAL_REVIEW",
      dueAt: nextCheckAt,
      actor: auth.actor,
      routing: auth.routing,
      reason: `Review ${direction.toLowerCase()} mail/courier item: ${description}`,
    });
  }
  return { status: "registered", contract: CONTRACT, coordination: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function recordSecretaryMailCourierReceipt({ context, payload = {} } = {}) {
  return mutateCoordination({
    context,
    payload: { ...payload, occurred_at: payload.received_at || payload.receivedAt },
    instruction: "Record explicit evidence that an inbound mail or courier item was physically received.",
    allowedStates: new Set(["REGISTERED", "EXCEPTION"]),
    producer: Object.assign(async ({ register, auth, at, evidenceId }) => {
      if (register.direction !== "INBOUND") throw new Error("SECRETARY_MAIL_COURIER_RECEIPT_INBOUND_ONLY");
      const holder = text(payload.custody_holder_party_id || payload.custodyHolderPartyId, 120) || auth.operational;
      await ensureParty({ organization: auth.organization, partyId: holder, field: "custody_holder" });
      return {
        patch: { state: "RECEIVED", custody_holder_party_id: holder, received_at: at, last_event_at: at },
        historyEntry: eventEntry({ event: "RECEIPT_RECORDED", evidenceId, at, actor: auth.actor, details: { custody_holder_party_id: holder } }),
      };
    }, { eventName: "RECEIPT_RECORDED" }),
  });
}

export async function recordSecretaryMailCourierRoute({ context, payload = {} } = {}) {
  return mutateCoordination({
    context,
    payload: { ...payload, occurred_at: payload.routed_at || payload.routedAt },
    instruction: "Record routing of a physically received inbound item to an explicitly identified recipient.",
    allowedStates: new Set(["RECEIVED", "ROUTED", "EXCEPTION"]),
    producer: Object.assign(async ({ register, auth, at, evidenceId }) => {
      if (register.direction !== "INBOUND") throw new Error("SECRETARY_MAIL_COURIER_ROUTE_INBOUND_ONLY");
      const recipientPartyId = text(payload.recipient_party_id || payload.recipientPartyId, 120);
      if (!recipientPartyId) throw new Error("SECRETARY_MAIL_COURIER_EXPLICIT_RECIPIENT_REQUIRED");
      await ensureParty({ organization: auth.organization, partyId: recipientPartyId, field: "recipient" });
      const handoffDueAt = optionalIso(payload.handoff_due_at || payload.handoffDueAt, "handoff_due_at");
      return {
        patch: { state: "ROUTED", recipient_party_id: recipientPartyId, routed_at: at, last_event_at: at },
        historyEntry: eventEntry({ event: "ROUTE_RECORDED", evidenceId, at, actor: auth.actor, details: { recipient_party_id: recipientPartyId } }),
        followUp: handoffDueAt ? { kind: "HANDOFF_REVIEW", dueAt: handoffDueAt, reason: "Review whether the explicitly routed inbound item has been handed to its recipient." } : null,
      };
    }, { eventName: "ROUTE_RECORDED" }),
  });
}

export async function recordSecretaryMailCourierHandoff({ context, payload = {} } = {}) {
  return mutateCoordination({
    context,
    payload: { ...payload, occurred_at: payload.handed_off_at || payload.handedOffAt },
    instruction: "Record explicit evidence that an inbound item was physically handed to its explicitly routed recipient.",
    allowedStates: new Set(["ROUTED", "EXCEPTION"]),
    producer: Object.assign(async ({ register, auth, at, evidenceId }) => {
      if (register.direction !== "INBOUND") throw new Error("SECRETARY_MAIL_COURIER_HANDOFF_INBOUND_ONLY");
      const recipientPartyId = text(payload.recipient_party_id || payload.recipientPartyId, 120);
      if (!recipientPartyId || recipientPartyId !== register.recipient_party_id) throw new Error("SECRETARY_MAIL_COURIER_HANDOFF_RECIPIENT_MISMATCH");
      await ensureParty({ organization: auth.organization, partyId: recipientPartyId, field: "recipient" });
      return {
        patch: { state: "COLLECTED", custody_holder_party_id: recipientPartyId, handed_off_at: at, last_event_at: at },
        historyEntry: eventEntry({ event: "HANDOFF_RECORDED", evidenceId, at, actor: auth.actor, details: { recipient_party_id: recipientPartyId, collection_inferred: false } }),
      };
    }, { eventName: "HANDOFF_RECORDED" }),
  });
}

export async function recordSecretaryMailCourierDispatch({ context, payload = {} } = {}) {
  return mutateCoordination({
    context,
    payload: { ...payload, occurred_at: payload.dispatched_at || payload.dispatchedAt },
    instruction: "Record explicit evidence that an outbound item was dispatched; do not purchase postage or book a carrier.",
    allowedStates: new Set(["REGISTERED", "EXCEPTION"]),
    producer: Object.assign(async ({ register, auth, at, evidenceId }) => {
      if (register.direction !== "OUTBOUND") throw new Error("SECRETARY_MAIL_COURIER_DISPATCH_OUTBOUND_ONLY");
      const carrierName = text(payload.carrier_name || payload.carrierName, 300) || register.carrier_name || null;
      const trackingReference = text(payload.tracking_reference || payload.trackingReference, 500) || register.tracking_reference || null;
      const deliveryCheckAt = optionalIso(payload.delivery_check_at || payload.deliveryCheckAt, "delivery_check_at");
      return {
        patch: { state: "DISPATCHED", carrier_name: carrierName, tracking_reference: trackingReference, dispatched_at: at, custody_holder_party_id: null, last_event_at: at },
        historyEntry: eventEntry({ event: "DISPATCH_RECORDED", evidenceId, at, actor: auth.actor, details: { carrier_name: carrierName, tracking_reference: trackingReference, dispatch_inferred: false } }),
        followUp: deliveryCheckAt ? { kind: "DELIVERY_REVIEW", dueAt: deliveryCheckAt, reason: "Review explicit delivery evidence for the dispatched outbound item." } : null,
      };
    }, { eventName: "DISPATCH_RECORDED" }),
  });
}

export async function recordSecretaryMailCourierDelivery({ context, payload = {} } = {}) {
  return mutateCoordination({
    context,
    payload: { ...payload, occurred_at: payload.delivered_at || payload.deliveredAt },
    instruction: "Record explicit delivery evidence for an outbound mail or courier item.",
    allowedStates: new Set(["DISPATCHED", "EXCEPTION"]),
    producer: Object.assign(async ({ register, auth, at, evidenceId }) => {
      if (register.direction !== "OUTBOUND") throw new Error("SECRETARY_MAIL_COURIER_DELIVERY_OUTBOUND_ONLY");
      return {
        patch: { state: "DELIVERED", delivered_at: at, last_event_at: at },
        historyEntry: eventEntry({ event: "DELIVERY_RECORDED", evidenceId, at, actor: auth.actor, details: { delivery_inferred: false } }),
      };
    }, { eventName: "DELIVERY_RECORDED" }),
  });
}

export async function recordSecretaryMailCourierException({ context, payload = {} } = {}) {
  const summary = text(payload.summary || payload.exception_summary || payload.exceptionSummary, 2000);
  if (!summary) throw new Error("SECRETARY_MAIL_COURIER_EXCEPTION_SUMMARY_REQUIRED");
  return mutateCoordination({
    context,
    payload: { ...payload, occurred_at: payload.recorded_at || payload.recordedAt },
    instruction: "Record an evidence-backed mail or courier exception for administrative follow-up.",
    allowedStates: new Set(["REGISTERED", "RECEIVED", "ROUTED", "DISPATCHED", "EXCEPTION"]),
    producer: Object.assign(async ({ register, auth, at, evidenceId }) => {
      const nextCheckAt = optionalIso(payload.next_check_at || payload.nextCheckAt, "next_check_at");
      return {
        patch: { state: "EXCEPTION", latest_exception: summary, latest_exception_at: at, last_event_at: at },
        historyEntry: eventEntry({ event: "EXCEPTION_RECORDED", evidenceId, at, actor: auth.actor, details: { summary } }),
        followUp: nextCheckAt ? { kind: "EXCEPTION_REVIEW", dueAt: nextCheckAt, reason: `Review mail/courier exception: ${summary}` } : null,
      };
    }, { eventName: "EXCEPTION_RECORDED" }),
  });
}

export async function cancelSecretaryMailCourierCoordination({ context, payload = {} } = {}) {
  return mutateCoordination({
    context,
    payload: { ...payload, occurred_at: payload.cancelled_at || payload.cancelledAt },
    instruction: "Cancel Secretary mail/courier coordination only; do not claim an external carrier shipment was cancelled.",
    allowedStates: new Set(["REGISTERED", "RECEIVED", "ROUTED", "DISPATCHED", "EXCEPTION", "CANCELLED"]),
    producer: Object.assign(async ({ register, auth, at, evidenceId }) => {
      const reason = text(payload.reason, 2000) || null;
      return {
        patch: { state: "CANCELLED", cancelled_at: at, cancellation_reason: reason, last_event_at: at },
        historyEntry: eventEntry({ event: "CANCELLED", evidenceId, at, actor: auth.actor, details: { reason, external_carrier_cancellation_performed: false } }),
      };
    }, { eventName: "CANCELLED" }),
  });
}

export async function readSecretaryMailCourierCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_MAIL_COURIER_COORDINATION_ID_REQUIRED");
  const task = await readTask({ organization, coordinationId });
  return { status: "completed", contract: CONTRACT, coordination: task, record: registerFromTask(task), ...safetyFlags() };
}

export async function listSecretaryMailCourierCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actorPartyId(context);
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("created_at", { ascending: false })
    .limit(Math.min(300, Math.max(1, Number(payload.limit || 100))));
  if (payload.include_terminal !== true && payload.includeTerminal !== true) query = query.in("status", ["OPEN", "IN_PROGRESS"]);
  const direction = text(payload.direction, 40).toUpperCase();
  const tasks = await many(query);
  const coordinations = tasks
    .map((task) => ({ task, record: registerFromTask(task) }))
    .filter((item) => (!direction || item.record.direction === direction))
    .filter((item) => item.record.canonical_owner_party_id === owner);
  return { status: "completed", contract: CONTRACT, owner_party_id: owner, count: coordinations.length, coordinations, ...safetyFlags() };
}

export default {
  startSecretaryMailCourierCoordination,
  recordSecretaryMailCourierReceipt,
  recordSecretaryMailCourierRoute,
  recordSecretaryMailCourierHandoff,
  recordSecretaryMailCourierDispatch,
  recordSecretaryMailCourierDelivery,
  recordSecretaryMailCourierException,
  cancelSecretaryMailCourierCoordination,
  readSecretaryMailCourierCoordination,
  listSecretaryMailCourierCoordination,
};