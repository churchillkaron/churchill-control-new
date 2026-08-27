import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_OFFICE_ADMINISTRATION_V1";
const SOURCE = "secretary_office_administration";
const REGISTER_KEY = "office_administration_v1";
const CATEGORIES = new Set([
  "OFFICE_SUPPLIES",
  "FACILITY_ISSUE",
  "EQUIPMENT_ISSUE",
  "ROOM_SETUP",
  "SERVICE_COORDINATION",
  "OTHER",
]);
const ACTIVE_STATES = new Set(["OPEN", "IN_PROGRESS", "WAITING_EXTERNAL", "WAITING_APPROVAL"]);
const TERMINAL_STATES = new Set(["COMPLETED", "CANCELLED"]);

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

function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_OFFICE_ADMIN_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_OFFICE_ADMIN_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function safetyFlags() {
  return {
    purchase_performed: false,
    order_placed: false,
    quote_accepted: false,
    vendor_terms_accepted: false,
    service_authorized_by_secretary: false,
    external_cancellation_performed: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    completion_inferred: false,
    repair_quality_inferred: false,
    supplies_received_inferred: false,
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

function normalizeCategory(value) {
  const category = text(value || "OTHER", 80).toUpperCase();
  if (!CATEGORIES.has(category)) throw new Error("SECRETARY_OFFICE_ADMIN_CATEGORY_INVALID");
  return category;
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
  if (!party) throw new Error(`SECRETARY_OFFICE_ADMIN_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return party;
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
    throw new Error(`SECRETARY_OFFICE_ADMIN_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_OFFICE_ADMIN_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function historyEvent({ event, evidenceId, at, actor, details = {} }) {
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
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_OFFICE_ADMIN_RECORD_INVALID");
  return { ...register, history: list(register.history), quotes: list(register.quotes) };
}

async function readTask({ organization, requestId }) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", requestId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_OFFICE_ADMIN_NOT_FOUND");
  return task;
}

function requestIdFor({ organization, category, title, evidenceId, startedAt }) {
  return deterministicUuid(`avantiqo-secretary-office-admin-v1:${organization}:${category}:${title}:${evidenceId}:${startedAt}`);
}

function followUpId({ taskId, kind, dueAt, targetPartyId }) {
  return deterministicUuid(`avantiqo-secretary-office-admin-follow-up-v1:${taskId}:${kind}:${dueAt}:${targetPartyId || "internal"}`);
}

async function ensureFollowUp({ task, register, kind, dueAt, targetPartyId = null, actor, routing, instruction, external = false }) {
  if (!dueAt) return null;
  const id = followUpId({ taskId: task.id, kind, dueAt, targetPartyId });
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const actionType = external ? await preferredActionType(task.organization_id, targetPartyId) : "REVIEW";
  return one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      id,
      organization_id: task.organization_id,
      entity_id: task.entity_id,
      owner_party_id: text(routing.operational_assignee_party_id, 120) || register.canonical_owner_party_id,
      contact_party_id: targetPartyId || null,
      task_id: task.id,
      action_type: actionType,
      reason: instruction,
      status: "PENDING",
      due_at: dueAt,
      created_by_party_id: actor,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: external && actionType !== "REVIEW",
        execution_instruction: instruction,
        secretary_owned: true,
        secretary_office_administration: true,
        secretary_office_administration_contract: CONTRACT,
        office_administration_kind: kind,
        office_administration_request_id: task.id,
        canonical_owner_party_id: register.canonical_owner_party_id,
        requires_owner_authority: false,
        ...secretaryAdministrativeCoverageMetadata(routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
}

async function cancelPendingFollowUps(task, reason) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const ids = rows
    .filter((row) => object(row.metadata).secretary_office_administration_contract === CONTRACT)
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

async function mutateRequest({ context, payload, instruction, allowedStates, eventName, producer }) {
  const requestId = text(payload.request_id || payload.requestId, 120);
  if (!requestId) throw new Error("SECRETARY_OFFICE_ADMIN_REQUEST_ID_REQUIRED");
  const organization = organizationId(context);
  const at = iso(
    payload.occurred_at || payload.occurredAt || payload.recorded_at || payload.recordedAt || payload.quoted_at || payload.quotedAt ||
      payload.confirmed_at || payload.confirmedAt || payload.completed_at || payload.completedAt || payload.cancelled_at || payload.cancelledAt,
    "occurred_at",
  );
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_OFFICE_ADMIN_EVIDENCE_REQUIRED");
  const auth = await routingFor({ context, instruction, at });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask({ organization, requestId });
    const register = registerFromTask(task);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) {
      if (replay.event === eventName) {
        return { status: "completed", contract: CONTRACT, request: task, record: register, replay_safe: true, ...safetyFlags() };
      }
      throw new Error("SECRETARY_OFFICE_ADMIN_EVIDENCE_REUSE_CONFLICT");
    }
    if (TERMINAL_STATES.has(register.state) && !allowedStates.has(register.state)) throw new Error("SECRETARY_OFFICE_ADMIN_ALREADY_TERMINAL");
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_OFFICE_ADMIN_STATE_INVALID:${register.state}`);

    const produced = await producer({ task, register, auth, at, evidenceId });
    const next = {
      ...register,
      ...object(produced.patch),
      contract: CONTRACT,
      history: [...register.history, produced.historyEntry].slice(-500),
      ...safetyFlags(),
    };
    const terminal = TERMINAL_STATES.has(next.state);
    const updatedResult = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: next.state === "CANCELLED" ? "CANCELLED" : next.state === "COMPLETED" ? "DONE" : "IN_PROGRESS",
        completed_at: terminal ? at : null,
        due_at: produced.taskDueAt === undefined ? task.due_at : produced.taskDueAt,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_office_administration_contract: CONTRACT,
          secretary_office_administration_state: next.state,
          ...secretaryAdministrativeCoverageMetadata(auth.routing),
          ...safetyFlags(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (updatedResult.error) throw updatedResult.error;
    if (!updatedResult.data) continue;
    const updated = updatedResult.data;

    if (terminal) await cancelPendingFollowUps(updated, "Office administration coordination reached terminal state.");
    for (const followUp of list(produced.followUps)) {
      await ensureFollowUp({
        task: updated,
        register: next,
        kind: followUp.kind,
        dueAt: followUp.dueAt,
        targetPartyId: followUp.targetPartyId || null,
        actor: auth.actor,
        routing: auth.routing,
        instruction: followUp.instruction,
        external: followUp.external === true,
      });
    }
    return { status: "completed", contract: CONTRACT, request: updated, record: next, replay_safe: false, ...safetyFlags() };
  }

  throw new Error("SECRETARY_OFFICE_ADMIN_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryOfficeAdministration({ context, payload = {} } = {}) {
  const category = normalizeCategory(payload.category);
  const title = text(payload.title, 600);
  if (!title) throw new Error("SECRETARY_OFFICE_ADMIN_TITLE_REQUIRED");
  const description = text(payload.description || payload.details, 4000);
  if (!description) throw new Error("SECRETARY_OFFICE_ADMIN_DESCRIPTION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_OFFICE_ADMIN_EVIDENCE_REQUIRED");
  const startedAt = iso(payload.started_at || payload.startedAt, "started_at");
  const auth = await routingFor({ context, instruction: `Coordinate office administration request: ${title}`, at: startedAt });
  const targetParty = await ensureParty({
    organization: auth.organization,
    partyId: payload.target_party_id || payload.targetPartyId,
    field: "target",
  });
  const desiredBy = iso(payload.desired_by || payload.desiredBy, "desired_by", false);
  const nextFollowUpAt = iso(payload.next_follow_up_at || payload.nextFollowUpAt, "next_follow_up_at", false);
  const requestId = requestIdFor({ organization: auth.organization, category, title, evidenceId, startedAt });
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", auth.organization)
      .eq("id", requestId)
      .maybeSingle(),
  );
  if (existing) {
    return { status: "registered", contract: CONTRACT, request: existing, record: registerFromTask(existing), replay_safe: true, ...safetyFlags() };
  }

  const state = targetParty ? "WAITING_EXTERNAL" : "OPEN";
  const register = {
    contract: CONTRACT,
    request_id: requestId,
    category,
    title,
    description,
    state,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    target_party_id: targetParty?.id || null,
    desired_by: desiredBy,
    started_at: startedAt,
    latest_update: null,
    external_commitment: null,
    quotes: [],
    history: [historyEvent({ event: "REQUEST_REGISTERED", evidenceId, at: startedAt, actor: auth.actor, details: { category, target_party_id: targetParty?.id || null } })],
    ...safetyFlags(),
  };
  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: requestId,
      organization_id: auth.organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: auth.operational,
      contact_party_id: targetParty?.id || null,
      title: `Office admin: ${title}`,
      details: description,
      status: "OPEN",
      priority: text(payload.priority || "NORMAL", 40).toUpperCase(),
      due_at: desiredBy,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_office_administration_contract: CONTRACT,
        secretary_office_administration_state: state,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );

  if (nextFollowUpAt) {
    const external = Boolean(targetParty);
    const instruction = external
      ? `Request a factual status update for office administration request "${title}". Do not place an order, accept a quote, authorize service, agree to terms, sign anything, or make payment.`
      : `Review office administration request "${title}". Determine the next administrative step without purchasing, accepting terms, authorizing service, or making payment.`;
    await ensureFollowUp({
      task,
      register,
      kind: external ? "EXTERNAL_STATUS_CHASE" : "INTERNAL_REVIEW",
      dueAt: nextFollowUpAt,
      targetPartyId: targetParty?.id || null,
      actor: auth.actor,
      routing: auth.routing,
      instruction,
      external,
    });
  }

  return { status: "registered", contract: CONTRACT, request: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function recordSecretaryOfficeAdministrationUpdate({ context, payload = {} } = {}) {
  const note = text(payload.update || payload.note || payload.summary, 3000);
  if (!note) throw new Error("SECRETARY_OFFICE_ADMIN_UPDATE_REQUIRED");
  const requestedState = text(payload.state, 80).toUpperCase();
  if (requestedState && !ACTIVE_STATES.has(requestedState)) throw new Error("SECRETARY_OFFICE_ADMIN_UPDATE_STATE_INVALID");
  return mutateRequest({
    context,
    payload,
    instruction: "Record an evidence-backed office administration progress/status update and continue bounded administrative follow-through.",
    allowedStates: ACTIVE_STATES,
    eventName: "UPDATE_RECORDED",
    producer: async ({ register, auth, at, evidenceId }) => {
      const targetParty = await ensureParty({
        organization: auth.organization,
        partyId: payload.target_party_id || payload.targetPartyId || register.target_party_id,
        field: "target",
      });
      const nextFollowUpAt = iso(payload.next_follow_up_at || payload.nextFollowUpAt, "next_follow_up_at", false);
      const nextState = requestedState || (targetParty ? "WAITING_EXTERNAL" : "IN_PROGRESS");
      const followUps = [];
      if (nextFollowUpAt) {
        const external = Boolean(targetParty);
        followUps.push({
          kind: external ? "EXTERNAL_STATUS_CHASE" : "INTERNAL_REVIEW",
          dueAt: nextFollowUpAt,
          targetPartyId: targetParty?.id || null,
          external,
          instruction: external
            ? `Request a factual status update for office administration request "${register.title}". Do not place an order, accept a quote, authorize service, agree to terms, sign anything, or make payment.`
            : `Review office administration request "${register.title}". Do not infer completion or create purchasing, signing, approval, or binding authority.`,
        });
      }
      return {
        patch: { state: nextState, target_party_id: targetParty?.id || null, latest_update: note, latest_update_at: at },
        historyEntry: historyEvent({ event: "UPDATE_RECORDED", evidenceId, at, actor: auth.actor, details: { update: note, state: nextState } }),
        followUps,
      };
    },
  });
}

export async function recordSecretaryOfficeAdministrationQuote({ context, payload = {} } = {}) {
  const vendorPartyId = text(payload.vendor_party_id || payload.vendorPartyId, 120);
  if (!vendorPartyId) throw new Error("SECRETARY_OFFICE_ADMIN_VENDOR_PARTY_REQUIRED");
  const quoteReference = text(payload.quote_reference || payload.quoteReference, 700);
  if (!quoteReference) throw new Error("SECRETARY_OFFICE_ADMIN_QUOTE_REFERENCE_REQUIRED");
  const amount = payload.amount === undefined || payload.amount === null ? null : Number(payload.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new Error("SECRETARY_OFFICE_ADMIN_QUOTE_AMOUNT_INVALID");
  const currency = text(payload.currency, 20).toUpperCase() || null;
  return mutateRequest({
    context,
    payload: { ...payload, occurred_at: payload.quoted_at || payload.quotedAt },
    instruction: "Record an informational vendor quote only. Do not accept the quote, place an order, authorize service, or create payment authority.",
    allowedStates: ACTIVE_STATES,
    eventName: "QUOTE_RECORDED",
    producer: async ({ register, auth, at, evidenceId }) => {
      await ensureParty({ organization: auth.organization, partyId: vendorPartyId, field: "vendor" });
      const quote = {
        quote_reference: quoteReference,
        vendor_party_id: vendorPartyId,
        amount,
        currency,
        quoted_at: at,
        evidence_id: evidenceId,
        quote_accepted: false,
        order_placed: false,
        service_authorized_by_secretary: false,
      };
      const approvalReviewAt = iso(payload.approval_review_at || payload.approvalReviewAt, "approval_review_at", false);
      const followUps = approvalReviewAt ? [{
        kind: "APPROVAL_REVIEW",
        dueAt: approvalReviewAt,
        targetPartyId: null,
        external: false,
        instruction: `Executive review of recorded quote ${quoteReference} for office administration request "${register.title}". The quote is informational only and has not been accepted; do not place an order, authorize service, sign terms, or make payment without a separately governed exact approval step.`,
      }] : [];
      return {
        patch: { state: approvalReviewAt ? "WAITING_APPROVAL" : register.state, quotes: [...register.quotes, quote].slice(-100) },
        historyEntry: historyEvent({ event: "QUOTE_RECORDED", evidenceId, at, actor: auth.actor, details: quote }),
        followUps,
      };
    },
  });
}

export async function recordSecretaryOfficeAdministrationCommitment({ context, payload = {} } = {}) {
  const authorizedByPartyId = text(payload.authorized_by_party_id || payload.authorizedByPartyId, 120);
  if (!authorizedByPartyId) throw new Error("SECRETARY_OFFICE_ADMIN_AUTHORIZED_BY_PARTY_REQUIRED");
  const reference = text(payload.reference || payload.commitment_reference || payload.commitmentReference, 1000);
  if (!reference) throw new Error("SECRETARY_OFFICE_ADMIN_COMMITMENT_REFERENCE_REQUIRED");
  return mutateRequest({
    context,
    payload: { ...payload, occurred_at: payload.confirmed_at || payload.confirmedAt },
    instruction: "Record evidence that an external party already authorized or placed an office administration commitment. This action itself creates no authority or commitment.",
    allowedStates: ACTIVE_STATES,
    eventName: "EXTERNAL_COMMITMENT_RECORDED",
    producer: async ({ register, auth, at, evidenceId }) => {
      await ensureParty({ organization: auth.organization, partyId: authorizedByPartyId, field: "authorized_by" });
      const nextFollowUpAt = iso(payload.next_follow_up_at || payload.nextFollowUpAt, "next_follow_up_at", false);
      const targetParty = await ensureParty({
        organization: auth.organization,
        partyId: payload.target_party_id || payload.targetPartyId || register.target_party_id,
        field: "target",
      });
      const commitment = {
        reference,
        authorized_by_party_id: authorizedByPartyId,
        confirmed_at: at,
        evidence_id: evidenceId,
        secretary_created_commitment: false,
      };
      const followUps = [];
      if (nextFollowUpAt) {
        const external = Boolean(targetParty);
        followUps.push({
          kind: external ? "COMMITMENT_STATUS_CHASE" : "COMMITMENT_REVIEW",
          dueAt: nextFollowUpAt,
          targetPartyId: targetParty?.id || null,
          external,
          instruction: external
            ? `Request a factual status update for externally authorized office administration commitment "${reference}". Do not amend terms, authorize additional work, place another order, or make payment.`
            : `Review externally authorized office administration commitment "${reference}" for status evidence. Do not infer delivery, repair quality, completion, invoice approval, or payment.`,
        });
      }
      return {
        patch: { state: targetParty ? "WAITING_EXTERNAL" : "IN_PROGRESS", external_commitment: commitment, target_party_id: targetParty?.id || register.target_party_id || null },
        historyEntry: historyEvent({ event: "EXTERNAL_COMMITMENT_RECORDED", evidenceId, at, actor: auth.actor, details: commitment }),
        followUps,
      };
    },
  });
}

export async function completeSecretaryOfficeAdministration({ context, payload = {} } = {}) {
  const summary = text(payload.completion_summary || payload.completionSummary || payload.summary, 3000);
  if (!summary) throw new Error("SECRETARY_OFFICE_ADMIN_COMPLETION_SUMMARY_REQUIRED");
  return mutateRequest({
    context,
    payload: { ...payload, occurred_at: payload.completed_at || payload.completedAt },
    instruction: "Record explicit completion evidence for office administration coordination. Do not infer repair quality, goods receipt, invoice approval, or payment.",
    allowedStates: ACTIVE_STATES,
    eventName: "COMPLETION_RECORDED",
    producer: async ({ auth, at, evidenceId }) => ({
      patch: { state: "COMPLETED", completion_summary: summary, completed_at: at },
      historyEntry: historyEvent({ event: "COMPLETION_RECORDED", evidenceId, at, actor: auth.actor, details: { completion_summary: summary } }),
    }),
  });
}

export async function cancelSecretaryOfficeAdministration({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 2000) || null;
  return mutateRequest({
    context,
    payload: { ...payload, occurred_at: payload.cancelled_at || payload.cancelledAt },
    instruction: "Cancel only Avantiqo's office administration coordination record; do not cancel an external order, appointment, service, contract, or payment.",
    allowedStates: new Set([...ACTIVE_STATES, "CANCELLED"]),
    eventName: "COORDINATION_CANCELLED",
    producer: async ({ auth, at, evidenceId }) => ({
      patch: { state: "CANCELLED", cancellation_reason: reason, cancelled_at: at },
      historyEntry: historyEvent({ event: "COORDINATION_CANCELLED", evidenceId, at, actor: auth.actor, details: { reason, external_cancellation_performed: false } }),
    }),
  });
}

export async function readSecretaryOfficeAdministration({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const requestId = text(payload.request_id || payload.requestId, 120);
  if (!requestId) throw new Error("SECRETARY_OFFICE_ADMIN_REQUEST_ID_REQUIRED");
  const task = await readTask({ organization, requestId });
  return { status: "completed", contract: CONTRACT, request: task, record: registerFromTask(task), ...safetyFlags() };
}

export async function listSecretaryOfficeAdministration({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("created_at", { ascending: false })
    .limit(Math.min(300, Math.max(1, Number(payload.limit || 100))));
  if (payload.include_terminal !== true && payload.includeTerminal !== true) query = query.in("status", ["OPEN", "IN_PROGRESS"]);
  const category = text(payload.category, 80).toUpperCase();
  const rows = await many(query);
  const requests = rows
    .map((task) => ({ task, record: registerFromTask(task) }))
    .filter((entry) => (!category || entry.record.category === category))
    .filter((entry) => entry.record.canonical_owner_party_id === owner);
  return { status: "completed", contract: CONTRACT, owner_party_id: owner, count: requests.length, requests, ...safetyFlags() };
}

export default {
  startSecretaryOfficeAdministration,
  recordSecretaryOfficeAdministrationUpdate,
  recordSecretaryOfficeAdministrationQuote,
  recordSecretaryOfficeAdministrationCommitment,
  completeSecretaryOfficeAdministration,
  cancelSecretaryOfficeAdministration,
  readSecretaryOfficeAdministration,
  listSecretaryOfficeAdministration,
};