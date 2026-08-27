import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_SIGNATURE_ROUTING_V1";
const SOURCE = "secretary_signature_routing";
const REGISTER_KEY = "signature_routing_v1";
const ROUTING_MODES = new Set(["PARALLEL", "SEQUENTIAL"]);
const ACTIVE_STATES = new Set(["WAITING_SIGNATURES", "PARTIALLY_SIGNED"]);
const TERMINAL_STATES = new Set(["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED"]);

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
    if (required) throw new Error(`SECRETARY_SIGNATURE_ROUTING_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_SIGNATURE_ROUTING_${field.toUpperCase()}_INVALID`);
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
    signature_performed_by_secretary: false,
    signature_authority_created: false,
    signer_identity_verified_inferred: false,
    signature_validity_inferred: false,
    consent_inferred: false,
    terms_accepted_by_secretary: false,
    document_modified_by_secretary: false,
    legal_effect_inferred: false,
    external_signature_revocation_performed: false,
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
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function normalizeMode(value) {
  const mode = text(value || "PARALLEL", 80).toUpperCase();
  if (!ROUTING_MODES.has(mode)) throw new Error("SECRETARY_SIGNATURE_ROUTING_MODE_INVALID");
  return mode;
}

async function ensureParty({ organization, partyId, field }) {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_SIGNATURE_ROUTING_${field.toUpperCase()}_PARTY_REQUIRED`);
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,email,phone,party_type,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error(`SECRETARY_SIGNATURE_ROUTING_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return party;
}

async function preferredActionType(organization, partyId) {
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
    scope: "DOCUMENT_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_SIGNATURE_ROUTING_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_SIGNATURE_ROUTING_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function normalizeSigner(input = {}, index) {
  const partyId = text(input.party_id || input.partyId, 120);
  if (!partyId) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_PARTY_REQUIRED");
  const order = Number(input.order ?? index + 1);
  if (!Number.isInteger(order) || order < 1) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_ORDER_INVALID");
  return {
    party_id: partyId,
    role: text(input.role, 300) || null,
    order,
    required: input.required !== false,
    state: "PENDING",
    requested_at: null,
    signed_at: null,
    signature_evidence_id: null,
    declined_at: null,
    decline_evidence_id: null,
    decline_reason: null,
    last_reminder_at: null,
  };
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
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_SIGNATURE_ROUTING_RECORD_INVALID");
  return { ...register, signers: list(register.signers), history: list(register.history) };
}

async function readTask({ organization, requestId }) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", requestId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_SIGNATURE_ROUTING_NOT_FOUND");
  return task;
}

function requestIdFor({ organization, title, documentReference, evidenceId, createdAt }) {
  return deterministicUuid(`avantiqo-secretary-signature-routing-v1:${organization}:${title}:${documentReference}:${evidenceId}:${createdAt}`);
}

function followUpId({ taskId, kind, dueAt, signerPartyId }) {
  return deterministicUuid(`avantiqo-secretary-signature-routing-follow-up-v1:${taskId}:${kind}:${dueAt}:${signerPartyId}`);
}

function activeSignerIds(register) {
  const pending = register.signers
    .filter((signer) => signer.state === "PENDING" || signer.state === "REQUESTED")
    .sort((a, b) => a.order - b.order);
  if (register.routing_mode === "PARALLEL") return pending.map((signer) => signer.party_id);
  const next = pending[0];
  return next ? [next.party_id] : [];
}

function allRequiredSigned(register) {
  const required = register.signers.filter((signer) => signer.required !== false);
  return required.length > 0 && required.every((signer) => signer.state === "SIGNED");
}

function requiredDeclined(register) {
  return register.signers.some((signer) => signer.required !== false && signer.state === "DECLINED");
}

async function ensureFollowUp({ task, register, kind, dueAt, signerPartyId, actor, routing, instruction }) {
  if (!dueAt) return null;
  const id = followUpId({ taskId: task.id, kind, dueAt, signerPartyId });
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const actionType = await preferredActionType(task.organization_id, signerPartyId);
  return one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      id,
      organization_id: task.organization_id,
      entity_id: task.entity_id,
      owner_party_id: text(routing.operational_assignee_party_id, 120) || register.canonical_owner_party_id,
      contact_party_id: signerPartyId,
      task_id: task.id,
      action_type: actionType,
      reason: instruction,
      status: "PENDING",
      due_at: dueAt,
      created_by_party_id: actor,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: actionType !== "REVIEW",
        execution_instruction: instruction,
        secretary_owned: true,
        secretary_signature_routing: true,
        secretary_signature_routing_contract: CONTRACT,
        signature_routing_kind: kind,
        signature_routing_request_id: task.id,
        signer_party_id: signerPartyId,
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
    .filter((row) => object(row.metadata).secretary_signature_routing_contract === CONTRACT)
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

async function cancelSignerFollowUps(task, signerPartyId, reason) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("contact_party_id", signerPartyId)
      .eq("status", "PENDING")
      .limit(200),
  );
  const ids = rows
    .filter((row) => object(row.metadata).secretary_signature_routing_contract === CONTRACT)
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

function requestInstruction(register, signer) {
  const role = signer.role ? ` (${signer.role})` : "";
  return `Request signature from the designated signer${role} for document reference ${register.document_reference}. This is signature coordination only. Do not sign for the person, accept terms, alter the document, assert identity verification, or claim legal validity.`;
}

async function seedActiveSignerFollowUps({ task, register, auth, dueAt }) {
  const ids = activeSignerIds(register);
  const signers = register.signers.filter((signer) => ids.includes(signer.party_id));
  for (const signer of signers) {
    await ensureFollowUp({
      task,
      register,
      kind: "SIGNATURE_REQUEST",
      dueAt,
      signerPartyId: signer.party_id,
      actor: auth.actor,
      routing: auth.routing,
      instruction: requestInstruction(register, signer),
    });
  }
}

async function mutateRequest({ context, payload, instruction, allowedStates, eventName, producer }) {
  const requestId = text(payload.request_id || payload.requestId, 120);
  if (!requestId) throw new Error("SECRETARY_SIGNATURE_ROUTING_REQUEST_ID_REQUIRED");
  const organization = organizationId(context);
  const at = iso(
    payload.occurred_at || payload.occurredAt || payload.signed_at || payload.signedAt || payload.declined_at || payload.declinedAt ||
      payload.reminder_at || payload.reminderAt || payload.cancelled_at || payload.cancelledAt,
    "occurred_at",
  );
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_SIGNATURE_ROUTING_EVIDENCE_REQUIRED");
  const auth = await routingFor({ context, instruction, at });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask({ organization, requestId });
    const register = registerFromTask(task);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) {
      if (replay.event === eventName) {
        return { status: "completed", contract: CONTRACT, request: task, record: register, replay_safe: true, ...safetyFlags() };
      }
      throw new Error("SECRETARY_SIGNATURE_ROUTING_EVIDENCE_REUSE_CONFLICT");
    }
    if (!allowedStates.has(register.state)) {
      if (TERMINAL_STATES.has(register.state)) throw new Error(`SECRETARY_SIGNATURE_ROUTING_ALREADY_TERMINAL:${register.state}`);
      throw new Error(`SECRETARY_SIGNATURE_ROUTING_STATE_INVALID:${register.state}`);
    }

    const produced = await producer({ task, register, auth, at, evidenceId });
    const next = {
      ...register,
      ...object(produced.patch),
      signers: list(produced.signers || register.signers),
      history: [...register.history, produced.historyEntry].slice(-500),
      ...safetyFlags(),
    };
    const terminal = TERMINAL_STATES.has(next.state);
    const updatedResult = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: next.state === "CANCELLED" ? "CANCELLED" : terminal ? "DONE" : "IN_PROGRESS",
        completed_at: terminal ? at : null,
        due_at: next.collection_deadline_at || null,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_signature_routing_contract: CONTRACT,
          secretary_signature_routing_state: next.state,
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

    for (const signerPartyId of list(produced.cancelSignerPartyIds)) {
      await cancelSignerFollowUps(updated, signerPartyId, "Signer reached a terminal routing status.");
    }
    if (terminal) {
      await cancelPendingFollowUps(updated, "Signature routing reached a terminal coordination state.");
    } else if (produced.seedNextSigner === true) {
      await seedActiveSignerFollowUps({ task: updated, register: next, auth, dueAt: at });
    }
    for (const followUp of list(produced.followUps)) {
      await ensureFollowUp({
        task: updated,
        register: next,
        kind: followUp.kind,
        dueAt: followUp.dueAt,
        signerPartyId: followUp.signerPartyId,
        actor: auth.actor,
        routing: auth.routing,
        instruction: followUp.instruction,
      });
    }

    return { status: "completed", contract: CONTRACT, request: updated, record: next, replay_safe: false, ...safetyFlags() };
  }

  throw new Error("SECRETARY_SIGNATURE_ROUTING_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretarySignatureRouting({ context, payload = {} } = {}) {
  const title = text(payload.title, 600);
  if (!title) throw new Error("SECRETARY_SIGNATURE_ROUTING_TITLE_REQUIRED");
  const documentReference = text(payload.document_reference || payload.documentReference, 2000);
  if (!documentReference) throw new Error("SECRETARY_SIGNATURE_ROUTING_DOCUMENT_REFERENCE_REQUIRED");
  const routingMode = normalizeMode(payload.routing_mode || payload.routingMode);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_SIGNATURE_ROUTING_EVIDENCE_REQUIRED");
  const createdAt = iso(payload.created_at || payload.createdAt, "created_at");
  const collectionDeadlineAt = iso(payload.collection_deadline_at || payload.collectionDeadlineAt, "collection_deadline_at", false);
  const initialRequestAt = iso(payload.initial_request_at || payload.initialRequestAt || createdAt, "initial_request_at");
  const auth = await routingFor({ context, instruction: `Coordinate signatures for ${title}.`, at: createdAt });
  const rawSigners = list(payload.signers);
  if (!rawSigners.length) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNERS_REQUIRED");
  const signers = rawSigners.map(normalizeSigner).sort((a, b) => a.order - b.order);
  if (!signers.some((signer) => signer.required !== false)) throw new Error("SECRETARY_SIGNATURE_ROUTING_REQUIRED_SIGNER_REQUIRED");
  const ids = signers.map((signer) => signer.party_id);
  if (new Set(ids).size !== ids.length) throw new Error("SECRETARY_SIGNATURE_ROUTING_DUPLICATE_SIGNER");
  const orders = signers.map((signer) => signer.order);
  if (new Set(orders).size !== orders.length && routingMode === "SEQUENTIAL") throw new Error("SECRETARY_SIGNATURE_ROUTING_DUPLICATE_ORDER");
  for (const signer of signers) {
    await ensureParty({ organization: auth.organization, partyId: signer.party_id, field: "signer" });
  }
  const requestId = requestIdFor({ organization: auth.organization, title, documentReference, evidenceId, createdAt });
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

  const activeIds = routingMode === "PARALLEL" ? signers.map((signer) => signer.party_id) : [signers[0].party_id];
  const routedSigners = signers.map((signer) => activeIds.includes(signer.party_id) ? { ...signer, state: "REQUESTED", requested_at: initialRequestAt } : signer);
  const register = {
    contract: CONTRACT,
    request_id: requestId,
    title,
    document_reference: documentReference,
    routing_mode: routingMode,
    state: "WAITING_SIGNATURES",
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    created_at: createdAt,
    collection_deadline_at: collectionDeadlineAt,
    signers: routedSigners,
    history: [eventEntry({
      event: "SIGNATURE_ROUTING_STARTED",
      evidenceId,
      at: createdAt,
      actor: auth.actor,
      details: { routing_mode: routingMode, signer_party_ids: ids, document_reference: documentReference },
    })],
    ...safetyFlags(),
  };

  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: requestId,
      organization_id: auth.organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: auth.operational,
      contact_party_id: activeIds[0] || null,
      title: `Signature routing: ${title}`,
      details: `Coordinate signatures for reference: ${documentReference}`,
      status: "IN_PROGRESS",
      priority: text(payload.priority, 40).toUpperCase() || "NORMAL",
      due_at: collectionDeadlineAt,
      remind_at: null,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_signature_routing_contract: CONTRACT,
        secretary_signature_routing_state: register.state,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );

  await seedActiveSignerFollowUps({ task, register, auth, dueAt: initialRequestAt });
  return { status: "registered", contract: CONTRACT, request: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function recordSecretarySignatureEvidence({ context, payload = {} } = {}) {
  const signerPartyId = text(payload.signer_party_id || payload.signerPartyId, 120);
  if (!signerPartyId) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_PARTY_REQUIRED");
  return mutateRequest({
    context,
    payload: { ...payload, occurred_at: payload.signed_at || payload.signedAt },
    instruction: "Record explicit signature evidence for a designated signer without asserting identity verification, legal validity, consent, or authority beyond the evidence supplied.",
    allowedStates: ACTIVE_STATES,
    eventName: "SIGNATURE_EVIDENCE_RECORDED",
    producer: async ({ register, auth, at, evidenceId }) => {
      const signerIndex = register.signers.findIndex((signer) => signer.party_id === signerPartyId);
      if (signerIndex < 0) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_NOT_IN_REQUEST");
      const signer = register.signers[signerIndex];
      if (signer.state === "DECLINED") throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_DECLINED");
      if (signer.state === "SIGNED") throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_ALREADY_SIGNED");
      if (register.routing_mode === "SEQUENTIAL" && !activeSignerIds(register).includes(signerPartyId)) {
        throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_NOT_CURRENT");
      }
      const signers = register.signers.map((entry, index) => index === signerIndex ? {
        ...entry,
        state: "SIGNED",
        signed_at: at,
        signature_evidence_id: evidenceId,
      } : entry);
      const provisional = { ...register, signers };
      const completed = allRequiredSigned(provisional);
      const nextActive = completed ? [] : activeSignerIds(provisional);
      const nextSigners = signers.map((entry) => nextActive.includes(entry.party_id) && entry.state === "PENDING"
        ? { ...entry, state: "REQUESTED", requested_at: at }
        : entry);
      const state = completed ? "COMPLETED" : "PARTIALLY_SIGNED";
      return {
        signers: nextSigners,
        patch: { state, completed_at: completed ? at : null },
        cancelSignerPartyIds: [signerPartyId],
        seedNextSigner: register.routing_mode === "SEQUENTIAL" && !completed,
        historyEntry: eventEntry({
          event: "SIGNATURE_EVIDENCE_RECORDED",
          evidenceId,
          at,
          actor: auth.actor,
          details: {
            signer_party_id: signerPartyId,
            package_completion_from_required_signature_evidence: completed,
            signature_validity_inferred: false,
            signer_identity_verified_inferred: false,
          },
        }),
      };
    },
  });
}

export async function recordSecretarySignatureDecline({ context, payload = {} } = {}) {
  const signerPartyId = text(payload.signer_party_id || payload.signerPartyId, 120);
  if (!signerPartyId) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_PARTY_REQUIRED");
  const reason = text(payload.reason, 2000) || null;
  return mutateRequest({
    context,
    payload: { ...payload, occurred_at: payload.declined_at || payload.declinedAt },
    instruction: "Record explicit signer decline evidence. Do not infer motive, legal effect, or contract cancellation.",
    allowedStates: ACTIVE_STATES,
    eventName: "SIGNER_DECLINE_RECORDED",
    producer: async ({ register, auth, at, evidenceId }) => {
      const signerIndex = register.signers.findIndex((signer) => signer.party_id === signerPartyId);
      if (signerIndex < 0) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_NOT_IN_REQUEST");
      const signer = register.signers[signerIndex];
      if (signer.state === "SIGNED") throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_ALREADY_SIGNED");
      if (signer.state === "DECLINED") throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_ALREADY_DECLINED");
      if (register.routing_mode === "SEQUENTIAL" && !activeSignerIds(register).includes(signerPartyId)) {
        throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_NOT_CURRENT");
      }
      const signers = register.signers.map((entry, index) => index === signerIndex ? {
        ...entry,
        state: "DECLINED",
        declined_at: at,
        decline_evidence_id: evidenceId,
        decline_reason: reason,
      } : entry);
      const provisional = { ...register, signers };
      const terminalDecline = requiredDeclined(provisional);
      const completed = !terminalDecline && allRequiredSigned(provisional);
      const state = terminalDecline ? "DECLINED" : completed ? "COMPLETED" : "PARTIALLY_SIGNED";
      const nextActive = TERMINAL_STATES.has(state) ? [] : activeSignerIds(provisional);
      const nextSigners = signers.map((entry) => nextActive.includes(entry.party_id) && entry.state === "PENDING"
        ? { ...entry, state: "REQUESTED", requested_at: at }
        : entry);
      return {
        signers: nextSigners,
        patch: { state, completed_at: completed ? at : null, declined_at: terminalDecline ? at : null },
        cancelSignerPartyIds: [signerPartyId],
        seedNextSigner: register.routing_mode === "SEQUENTIAL" && !TERMINAL_STATES.has(state),
        historyEntry: eventEntry({
          event: "SIGNER_DECLINE_RECORDED",
          evidenceId,
          at,
          actor: auth.actor,
          details: { signer_party_id: signerPartyId, required_signer: signer.required !== false, reason, legal_effect_inferred: false },
        }),
      };
    },
  });
}

export async function scheduleSecretarySignatureReminder({ context, payload = {} } = {}) {
  const signerPartyId = text(payload.signer_party_id || payload.signerPartyId, 120);
  if (!signerPartyId) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_PARTY_REQUIRED");
  const dueAt = iso(payload.remind_at || payload.remindAt, "remind_at");
  return mutateRequest({
    context,
    payload: { ...payload, occurred_at: payload.reminder_at || payload.reminderAt || dueAt },
    instruction: "Schedule a factual signature reminder to a designated pending signer. Do not imply that the signer already agreed, signed, or accepted terms.",
    allowedStates: ACTIVE_STATES,
    eventName: "SIGNATURE_REMINDER_SCHEDULED",
    producer: async ({ register, auth, at, evidenceId }) => {
      const signerIndex = register.signers.findIndex((signer) => signer.party_id === signerPartyId);
      if (signerIndex < 0) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_NOT_IN_REQUEST");
      const signer = register.signers[signerIndex];
      if (!new Set(["PENDING", "REQUESTED"]).has(signer.state)) throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_NOT_PENDING");
      if (register.routing_mode === "SEQUENTIAL" && !activeSignerIds(register).includes(signerPartyId)) {
        throw new Error("SECRETARY_SIGNATURE_ROUTING_SIGNER_NOT_CURRENT");
      }
      const signers = register.signers.map((entry, index) => index === signerIndex ? { ...entry, last_reminder_at: dueAt } : entry);
      return {
        signers,
        patch: {},
        followUps: [{
          kind: "SIGNATURE_REMINDER",
          dueAt,
          signerPartyId,
          instruction: `Remind the designated signer about the outstanding signature for document reference ${register.document_reference}. Do not sign for them, assert consent, or claim legal validity.`,
        }],
        historyEntry: eventEntry({ event: "SIGNATURE_REMINDER_SCHEDULED", evidenceId, at, actor: auth.actor, details: { signer_party_id: signerPartyId, remind_at: dueAt } }),
      };
    },
  });
}

export async function refreshSecretarySignatureRouting({ context, payload = {} } = {}) {
  const requestId = text(payload.request_id || payload.requestId, 120);
  if (!requestId) throw new Error("SECRETARY_SIGNATURE_ROUTING_REQUEST_ID_REQUIRED");
  const asOf = iso(payload.as_of || payload.asOf, "as_of");
  const organization = organizationId(context);
  const task = await readTask({ organization, requestId });
  const register = registerFromTask(task);
  if (TERMINAL_STATES.has(register.state)) return { status: "completed", contract: CONTRACT, request: task, record: register, changed: false, ...safetyFlags() };
  if (!register.collection_deadline_at || Date.parse(asOf) <= Date.parse(register.collection_deadline_at)) {
    return { status: "completed", contract: CONTRACT, request: task, record: register, changed: false, ...safetyFlags() };
  }
  return mutateRequest({
    context,
    payload: { request_id: requestId, evidence_id: `temporal-expiry:${register.collection_deadline_at}:${asOf}`, occurred_at: asOf },
    instruction: "Close the Secretary signature-collection routing after its explicit collection deadline. This does not declare the document, signatures, offer, or contract legally expired.",
    allowedStates: ACTIVE_STATES,
    eventName: "COLLECTION_DEADLINE_PASSED",
    producer: async ({ register: current, auth, at, evidenceId }) => ({
      patch: { state: "EXPIRED", expired_at: at },
      historyEntry: eventEntry({
        event: "COLLECTION_DEADLINE_PASSED",
        evidenceId,
        at,
        actor: auth.actor,
        details: { collection_deadline_at: current.collection_deadline_at, legal_effect_inferred: false },
      }),
    }),
  });
}

export async function cancelSecretarySignatureRouting({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 2000) || null;
  return mutateRequest({
    context,
    payload: { ...payload, occurred_at: payload.cancelled_at || payload.cancelledAt },
    instruction: "Cancel only Secretary signature coordination. Do not revoke signatures, terminate agreements, withdraw offers, or alter the referenced document.",
    allowedStates: new Set(["WAITING_SIGNATURES", "PARTIALLY_SIGNED", "CANCELLED"]),
    eventName: "SIGNATURE_ROUTING_CANCELLED",
    producer: async ({ auth, at, evidenceId }) => ({
      patch: { state: "CANCELLED", cancelled_at: at, cancellation_reason: reason },
      historyEntry: eventEntry({ event: "SIGNATURE_ROUTING_CANCELLED", evidenceId, at, actor: auth.actor, details: { reason, external_signature_revocation_performed: false, legal_effect_inferred: false } }),
    }),
  });
}

export async function readSecretarySignatureRouting({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const requestId = text(payload.request_id || payload.requestId, 120);
  if (!requestId) throw new Error("SECRETARY_SIGNATURE_ROUTING_REQUEST_ID_REQUIRED");
  const task = await readTask({ organization, requestId });
  return { status: "completed", contract: CONTRACT, request: task, record: registerFromTask(task), ...safetyFlags() };
}

export async function listSecretarySignatureRouting({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const rows = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", SOURCE)
      .order("created_at", { ascending: false })
      .limit(Math.min(300, Math.max(1, Number(payload.limit || 100)))),
  );
  const includeTerminal = payload.include_terminal === true || payload.includeTerminal === true;
  const requests = rows
    .map((task) => ({ task, record: registerFromTask(task) }))
    .filter((entry) => entry.record.canonical_owner_party_id === owner)
    .filter((entry) => includeTerminal || !TERMINAL_STATES.has(entry.record.state));
  return { status: "completed", contract: CONTRACT, owner_party_id: owner, count: requests.length, requests, ...safetyFlags() };
}

export default {
  startSecretarySignatureRouting,
  recordSecretarySignatureEvidence,
  recordSecretarySignatureDecline,
  scheduleSecretarySignatureReminder,
  refreshSecretarySignatureRouting,
  cancelSecretarySignatureRouting,
  readSecretarySignatureRouting,
  listSecretarySignatureRouting,
};
