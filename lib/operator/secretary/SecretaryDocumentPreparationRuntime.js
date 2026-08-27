import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DOCUMENT_PREPARATION_V1";
const SOURCE = "secretary_document_preparation";
const REGISTER_KEY = "document_preparation_v1";
const KINDS = new Set(["GENERAL_DOCUMENT", "LETTER", "MEMO", "REPORT", "BRIEFING", "EMAIL_DRAFT", "AGENDA_SUPPORT", "OTHER"]);
const CHANGE_SCOPES = new Set([
  "PROOFREAD_ONLY",
  "FORMAT_ONLY",
  "PROOFREAD_AND_FORMAT",
  "POLISH_PRESERVE_MEANING",
  "RESTRUCTURE_PRESERVE_MEANING",
]);
const MUTABLE_STATES = new Set(["DRAFT", "FINAL"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function exactText(value, field, limit = 60000) {
  if (typeof value !== "string") throw new Error(`SECRETARY_DOCUMENT_PREPARATION_${field.toUpperCase()}_MUST_BE_STRING`);
  if (!value.trim()) throw new Error(`SECRETARY_DOCUMENT_PREPARATION_${field.toUpperCase()}_REQUIRED`);
  if (value.length > limit) throw new Error(`SECRETARY_DOCUMENT_PREPARATION_${field.toUpperCase()}_TOO_LARGE`);
  return value;
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
  if (!raw) throw new Error(`SECRETARY_DOCUMENT_PREPARATION_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_DOCUMENT_PREPARATION_${field.toUpperCase()}_INVALID`);
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

function safetyFlags() {
  return {
    source_text_preserved: true,
    prepared_text_stored_exactly: true,
    source_meaning_changed_by_runtime: false,
    semantic_equivalence_verified: false,
    factual_accuracy_verified: false,
    legal_accuracy_verified: false,
    business_approval_inferred: false,
    correspondence_sent: false,
    document_published: false,
    document_filed: false,
    signature_applied: false,
    binding_submission_performed: false,
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

function normalizeKind(value) {
  const kind = text(value || "GENERAL_DOCUMENT", 80).toUpperCase();
  if (!KINDS.has(kind)) throw new Error("SECRETARY_DOCUMENT_PREPARATION_KIND_INVALID");
  return kind;
}

function normalizeScope(value) {
  const scope = text(value, 120).toUpperCase();
  if (!CHANGE_SCOPES.has(scope)) throw new Error("SECRETARY_DOCUMENT_PREPARATION_CHANGE_SCOPE_INVALID");
  return scope;
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
    throw new Error(`SECRETARY_DOCUMENT_PREPARATION_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_DOCUMENT_PREPARATION_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_DOCUMENT_PREPARATION_RECORD_INVALID");
  return {
    ...register,
    history: list(register.history),
    prepared_versions: list(register.prepared_versions),
  };
}

async function readTask({ organization, preparationId }) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", preparationId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_DOCUMENT_PREPARATION_NOT_FOUND");
  return task;
}

function eventEntry({ event, evidenceId, at, actor, version, payloadHash, details = {} }) {
  return {
    event,
    evidence_id: evidenceId,
    occurred_at: at,
    recorded_by_party_id: actor,
    version,
    payload_sha256: payloadHash,
    ...object(details),
    ...safetyFlags(),
  };
}

function preparedVersion({ version, preparedText, evidenceId, at, changeScope, changeSummary }) {
  return {
    version,
    exact_prepared_text: preparedText,
    prepared_sha256: sha256(preparedText),
    evidence_id: evidenceId,
    prepared_at: at,
    change_scope: changeScope,
    change_summary: changeSummary || null,
    prepared_text_stored_exactly: true,
    semantic_equivalence_verified: false,
    factual_accuracy_verified: false,
    legal_accuracy_verified: false,
  };
}

function replayOrConflict(register, evidenceId, eventName, payloadHash) {
  const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
  if (!replay) return null;
  if (replay.event !== eventName || replay.payload_sha256 !== payloadHash) {
    throw new Error("SECRETARY_DOCUMENT_PREPARATION_EVIDENCE_REUSE_CONFLICT");
  }
  return replay;
}

async function mutatePreparation({ context, payload, instruction, eventName, allowedStates, payloadHash, producer }) {
  const preparationId = text(payload.preparation_id || payload.preparationId, 120);
  if (!preparationId) throw new Error("SECRETARY_DOCUMENT_PREPARATION_ID_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_DOCUMENT_PREPARATION_EVIDENCE_REQUIRED");
  const at = iso(
    payload.occurred_at || payload.occurredAt || payload.revised_at || payload.revisedAt || payload.finalized_at || payload.finalizedAt || payload.cancelled_at || payload.cancelledAt,
    "occurred_at",
  );
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_DOCUMENT_PREPARATION_EXPECTED_VERSION_REQUIRED");
  const auth = await routingFor({ context, instruction, at });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask({ organization: auth.organization, preparationId });
    const register = registerFromTask(task);
    const replay = replayOrConflict(register, evidenceId, eventName, payloadHash);
    if (replay) {
      return { status: "completed", contract: CONTRACT, preparation: task, record: register, replay_safe: true, ...safetyFlags() };
    }
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_DOCUMENT_PREPARATION_STALE_VERSION");
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_DOCUMENT_PREPARATION_STATE_INVALID:${register.state}`);

    const nextVersion = Number(register.version) + 1;
    const produced = await producer({ task, register, auth, at, evidenceId, nextVersion });
    const next = {
      ...register,
      ...object(produced.patch),
      version: nextVersion,
      contract: CONTRACT,
      history: [...register.history, produced.historyEntry].slice(-500),
      prepared_versions: list(produced.preparedVersions || register.prepared_versions).slice(-25),
      ...safetyFlags(),
    };
    const terminal = next.state === "FINAL" || next.state === "CANCELLED";
    const result = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: next.state === "CANCELLED" ? "CANCELLED" : "DONE",
        completed_at: terminal ? at : null,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_document_preparation_contract: CONTRACT,
          secretary_document_preparation_state: next.state,
          ledger_task_is_execution_work: false,
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
    if (result.error) throw result.error;
    if (!result.data) continue;
    return { status: "completed", contract: CONTRACT, preparation: result.data, record: next, replay_safe: false, ...safetyFlags() };
  }
  throw new Error("SECRETARY_DOCUMENT_PREPARATION_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function prepareSecretaryDocument({ context, payload = {} } = {}) {
  const kind = normalizeKind(payload.kind);
  const title = text(payload.title, 600);
  if (!title) throw new Error("SECRETARY_DOCUMENT_PREPARATION_TITLE_REQUIRED");
  const sourceText = exactText(payload.source_text ?? payload.sourceText, "source_text");
  const preparedText = exactText(payload.prepared_text ?? payload.preparedText, "prepared_text");
  const changeScope = normalizeScope(payload.change_scope || payload.changeScope);
  const changeSummary = text(payload.change_summary || payload.changeSummary, 4000) || null;
  const instruction = text(payload.instruction, 4000) || `Prepare ${kind.toLowerCase()} using ${changeScope.toLowerCase()} and preserve source meaning.`;
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_DOCUMENT_PREPARATION_EVIDENCE_REQUIRED");
  const preparedAt = iso(payload.prepared_at || payload.preparedAt, "prepared_at");
  const auth = await routingFor({ context, instruction, at: preparedAt });
  const sourceHash = sha256(sourceText);
  const preparedHash = sha256(preparedText);
  const payloadHash = sha256(JSON.stringify({ kind, title, sourceHash, preparedHash, changeScope, changeSummary, instruction, evidenceId, preparedAt }));
  const preparationId = deterministicUuid(`avantiqo-secretary-document-preparation-v1:${auth.organization}:${evidenceId}`);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", auth.organization)
      .eq("id", preparationId)
      .maybeSingle(),
  );
  if (existing) {
    const register = registerFromTask(existing);
    const replay = replayOrConflict(register, evidenceId, "DOCUMENT_PREPARED", payloadHash);
    if (!replay) throw new Error("SECRETARY_DOCUMENT_PREPARATION_EVIDENCE_REUSE_CONFLICT");
    return { status: "prepared", contract: CONTRACT, preparation: existing, record: register, replay_safe: true, ...safetyFlags() };
  }

  const register = {
    contract: CONTRACT,
    preparation_id: preparationId,
    kind,
    title,
    state: "DRAFT",
    version: 1,
    exact_source_text: sourceText,
    source_sha256: sourceHash,
    exact_prepared_text: preparedText,
    prepared_sha256: preparedHash,
    change_scope: changeScope,
    change_summary: changeSummary,
    instruction,
    source_reference: text(payload.source_reference || payload.sourceReference, 1200) || null,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    prepared_at: preparedAt,
    finalized_at: null,
    prepared_versions: [preparedVersion({ version: 1, preparedText, evidenceId, at: preparedAt, changeScope, changeSummary })],
    history: [eventEntry({
      event: "DOCUMENT_PREPARED",
      evidenceId,
      at: preparedAt,
      actor: auth.actor,
      version: 1,
      payloadHash,
      details: { kind, source_sha256: sourceHash, prepared_sha256: preparedHash, change_scope: changeScope },
    })],
    ...safetyFlags(),
  };

  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: preparationId,
      organization_id: auth.organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: auth.operational,
      contact_party_id: null,
      title: `Prepare document: ${title}`,
      details: `${kind} controlled document preparation ledger`,
      status: "DONE",
      priority: "NORMAL",
      due_at: null,
      remind_at: null,
      completed_at: null,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_document_preparation_contract: CONTRACT,
        secretary_document_preparation_state: "DRAFT",
        ledger_task_is_execution_work: false,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );

  return { status: "prepared", contract: CONTRACT, preparation: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function reviseSecretaryDocumentPreparation({ context, payload = {} } = {}) {
  const preparedText = exactText(payload.prepared_text ?? payload.preparedText, "prepared_text");
  const changeScope = normalizeScope(payload.change_scope || payload.changeScope);
  const changeSummary = text(payload.change_summary || payload.changeSummary, 4000) || null;
  const instruction = text(payload.instruction, 4000) || `Revise prepared document using ${changeScope.toLowerCase()} while preserving source meaning.`;
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const revisedAt = iso(payload.revised_at || payload.revisedAt, "revised_at");
  const payloadHash = sha256(JSON.stringify({ prepared_sha256: sha256(preparedText), changeScope, changeSummary, instruction, evidenceId, revisedAt }));
  return mutatePreparation({
    context,
    payload: { ...payload, occurred_at: revisedAt },
    instruction,
    eventName: "DOCUMENT_REVISION_RECORDED",
    allowedStates: MUTABLE_STATES,
    payloadHash,
    producer: async ({ register, auth, at, nextVersion }) => ({
      patch: {
        state: "DRAFT",
        exact_prepared_text: preparedText,
        prepared_sha256: sha256(preparedText),
        change_scope: changeScope,
        change_summary: changeSummary,
        instruction,
        finalized_at: null,
      },
      preparedVersions: [...register.prepared_versions, preparedVersion({ version: nextVersion, preparedText, evidenceId, at, changeScope, changeSummary })],
      historyEntry: eventEntry({
        event: "DOCUMENT_REVISION_RECORDED",
        evidenceId,
        at,
        actor: auth.actor,
        version: nextVersion,
        payloadHash,
        details: { prepared_sha256: sha256(preparedText), change_scope: changeScope },
      }),
    }),
  });
}

export async function finalizeSecretaryDocumentPreparation({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const finalizedAt = iso(payload.finalized_at || payload.finalizedAt, "finalized_at");
  const payloadHash = sha256(JSON.stringify({ evidenceId, finalizedAt, mode: "FINALIZE_INTERNAL_COPY" }));
  return mutatePreparation({
    context,
    payload: { ...payload, occurred_at: finalizedAt },
    instruction: "Mark the prepared text as the final internal copy only. Do not send, publish, file, sign, submit, approve, or assert factual/legal correctness.",
    eventName: "DOCUMENT_PREPARATION_FINALIZED",
    allowedStates: new Set(["DRAFT"]),
    payloadHash,
    producer: async ({ register, auth, at, nextVersion }) => ({
      patch: { state: "FINAL", finalized_at: at },
      historyEntry: eventEntry({
        event: "DOCUMENT_PREPARATION_FINALIZED",
        evidenceId,
        at,
        actor: auth.actor,
        version: nextVersion,
        payloadHash,
        details: { prepared_sha256: register.prepared_sha256, final_internal_copy_only: true },
      }),
    }),
  });
}

export async function cancelSecretaryDocumentPreparation({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const cancelledAt = iso(payload.cancelled_at || payload.cancelledAt, "cancelled_at");
  const reason = text(payload.reason, 2000);
  if (!reason) throw new Error("SECRETARY_DOCUMENT_PREPARATION_CANCEL_REASON_REQUIRED");
  const payloadHash = sha256(JSON.stringify({ evidenceId, cancelledAt, reason }));
  return mutatePreparation({
    context,
    payload: { ...payload, occurred_at: cancelledAt },
    instruction: "Cancel only the Secretary document-preparation record. Do not delete source material or alter external documents.",
    eventName: "DOCUMENT_PREPARATION_CANCELLED",
    allowedStates: MUTABLE_STATES,
    payloadHash,
    producer: async ({ auth, at, nextVersion }) => ({
      patch: { state: "CANCELLED", cancelled_at: at, cancellation_reason: reason },
      historyEntry: eventEntry({
        event: "DOCUMENT_PREPARATION_CANCELLED",
        evidenceId,
        at,
        actor: auth.actor,
        version: nextVersion,
        payloadHash,
        details: { reason },
      }),
    }),
  });
}

export async function readSecretaryDocumentPreparation({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const preparationId = text(payload.preparation_id || payload.preparationId, 120);
  if (!preparationId) throw new Error("SECRETARY_DOCUMENT_PREPARATION_ID_REQUIRED");
  const task = await readTask({ organization, preparationId });
  return { status: "completed", contract: CONTRACT, preparation: task, record: registerFromTask(task), ...safetyFlags() };
}

export async function listSecretaryDocumentPreparations({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const includeCancelled = payload.include_cancelled === true || payload.includeCancelled === true;
  const limitValue = Number(payload.limit);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(200, Math.floor(limitValue))) : 50;
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeCancelled) query = query.neq("status", "CANCELLED");
  const rows = await many(query);
  return {
    status: "completed",
    contract: CONTRACT,
    count: rows.length,
    preparations: rows.map((preparation) => ({ preparation, record: registerFromTask(preparation) })),
    ...safetyFlags(),
  };
}

export default {
  prepareSecretaryDocument,
  reviseSecretaryDocumentPreparation,
  finalizeSecretaryDocumentPreparation,
  cancelSecretaryDocumentPreparation,
  readSecretaryDocumentPreparation,
  listSecretaryDocumentPreparations,
};
