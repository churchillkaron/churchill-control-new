import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_ACCESS_MEDIA_CUSTODY_V1";
const SOURCE = "secretary_access_media_custody";
const REGISTER_KEY = "access_media_custody_v1";
const MEDIA_KINDS = new Set(["KEY", "ACCESS_CARD", "BADGE", "FOB", "TOKEN", "OTHER"]);
const ACTIVE_STATES = new Set(["STORED", "ISSUED", "IN_TRANSFER", "MISSING"]);
const SECRET_FIELDS = new Set([
  "pin",
  "pin_code",
  "password",
  "secret",
  "access_code",
  "door_code",
  "activation_code",
  "credential_secret",
  "credential_value",
  "private_key",
]);

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function organizationId(context = {}) { const id = text(context.organizationId, 120); if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED"); return id; }
function actorPartyId(context = {}) { const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120); if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED"); return id; }
function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) { if (required) throw new Error(`SECRETARY_ACCESS_MEDIA_${field.toUpperCase()}_REQUIRED`); return null; }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_ACCESS_MEDIA_${field.toUpperCase()}_INVALID`);
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
    custody_inferred: false,
    missing_status_inferred: false,
    physical_access_granted: false,
    access_permission_granted: false,
    access_permission_revoked: false,
    access_control_system_mutated: false,
    credential_activated: false,
    credential_deactivated: false,
    credential_secret_stored: false,
    identity_verified_inferred: false,
    security_incident_declared: false,
    external_message_sent_by_runtime: false,
    platform_permissions_mutated: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
}
function assertNoCredentialSecret(value) {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoCredentialSecret(entry);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_FIELDS.has(String(key).trim().toLowerCase())) throw new Error("SECRETARY_ACCESS_MEDIA_CREDENTIAL_SECRET_FORBIDDEN");
    assertNoCredentialSecret(entry);
  }
}
async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function many(result) { const resolved = await result; if (resolved.error) throw resolved.error; return Array.isArray(resolved.data) ? resolved.data : []; }

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
  if (routing.coverage_routing_review_required === true) throw new Error(`SECRETARY_ACCESS_MEDIA_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_ACCESS_MEDIA_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function ensureParty(organization, partyId, field) {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_ACCESS_MEDIA_${field.toUpperCase()}_PARTY_REQUIRED`);
  const row = await one(supabaseAdmin.from("parties").select("id,display_name,status").eq("organization_id", organization).eq("id", id).maybeSingle());
  if (!row || row.status !== "ACTIVE") throw new Error(`SECRETARY_ACCESS_MEDIA_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return row;
}
function requiredSourceReference(payload = {}) {
  const value = text(payload.source_reference || payload.sourceReference, 1200);
  if (!value) throw new Error("SECRETARY_ACCESS_MEDIA_SOURCE_REFERENCE_REQUIRED");
  return value;
}
function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_ACCESS_MEDIA_RECORD_INVALID");
  return {
    ...register,
    history: list(register.history),
    custody_history: list(register.custody_history),
    missing_history: list(register.missing_history),
  };
}
async function readTask(organization, custodyId) {
  const task = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("id", custodyId).maybeSingle());
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_ACCESS_MEDIA_NOT_FOUND");
  return task;
}
function currentTemporalState(register, now = new Date()) {
  const at = now instanceof Date ? now.getTime() : Date.parse(String(now));
  const returnAt = register.expected_return_at ? Date.parse(register.expected_return_at) : NaN;
  const transferAt = register.pending_transfer?.acknowledgement_due_at ? Date.parse(register.pending_transfer.acknowledgement_due_at) : NaN;
  return {
    return_overdue_temporal_only: register.state === "ISSUED" && Number.isFinite(returnAt) && Number.isFinite(at) && at > returnAt,
    transfer_ack_overdue_temporal_only: register.state === "IN_TRANSFER" && Number.isFinite(transferAt) && Number.isFinite(at) && at > transferAt,
    missing_inferred_from_overdue: false,
  };
}
function response(task, register, extra = {}) { return { status: "completed", contract: CONTRACT, custody: task, record: register, ...currentTemporalState(register), ...extra, ...safetyFlags() }; }
function followUpId(custodyId, kind, version) { return deterministicUuid(`avantiqo-secretary-access-media-follow-up-v1:${custodyId}:${kind}:${version}`); }

async function preferredActionType(organization, partyId) {
  if (!partyId) return "REVIEW";
  const profile = await one(supabaseAdmin.from("secretary_contact_profiles").select("preferred_channel,allow_calls,allow_messages").eq("organization_id", organization).eq("party_id", partyId).maybeSingle());
  const preferred = text(profile?.preferred_channel, 80).toLowerCase();
  if (preferred.includes("email")) return "EMAIL";
  if (profile?.allow_messages !== false) return "MESSAGE";
  if (profile?.allow_calls !== false) return "CALL";
  return "REVIEW";
}
async function ensureFollowUp({ task, register, kind, dueAt, targetPartyId, actor, routing, instruction }) {
  if (!dueAt) return null;
  const id = followUpId(task.id, kind, register.version);
  const existing = await one(supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", task.organization_id).eq("id", id).maybeSingle());
  if (existing) return existing;
  const actionType = await preferredActionType(task.organization_id, targetPartyId);
  return one(supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id,
    owner_party_id: register.operational_assignee_party_id || task.owner_party_id,
    contact_party_id: targetPartyId || null,
    task_id: task.id,
    action_type: actionType,
    reason: instruction,
    status: "PENDING",
    due_at: dueAt,
    created_by_party_id: actor,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: Boolean(targetPartyId) && actionType !== "REVIEW",
      execution_instruction: instruction,
      secretary_owned: true,
      secretary_access_media_custody: true,
      secretary_access_media_custody_contract: CONTRACT,
      access_media_custody_id: task.id,
      access_media_follow_up_kind: kind,
      canonical_owner_party_id: register.canonical_owner_party_id,
      requires_owner_authority: false,
      ...secretaryAdministrativeCoverageMetadata(routing),
      ...safetyFlags(),
    },
  }).select("*").single());
}
async function cancelPendingFollowUps(task, reason, kinds = null) {
  const rows = await many(supabaseAdmin.from("secretary_follow_ups").select("id,metadata").eq("organization_id", task.organization_id).eq("task_id", task.id).eq("status", "PENDING").limit(500));
  const allowed = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_access_media_custody_contract !== CONTRACT) return false;
    return !allowed || allowed.has(text(metadata.access_media_follow_up_kind, 80));
  }).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups").update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now }).eq("organization_id", task.organization_id).in("id", ids);
  if (result.error) throw result.error;
  return ids;
}
function replayOrConflict(register, evidenceId, eventName, hash) {
  const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
  if (!replay) return null;
  if (replay.event !== eventName || replay.payload_sha256 !== hash) throw new Error("SECRETARY_ACCESS_MEDIA_EVIDENCE_REUSE_CONFLICT");
  return replay;
}
async function mutate({ context, payload, eventName, instruction, allowedStates = ACTIVE_STATES, producer }) {
  assertNoCredentialSecret(payload);
  const custodyId = text(payload.custody_id || payload.custodyId, 120);
  if (!custodyId) throw new Error("SECRETARY_ACCESS_MEDIA_CUSTODY_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_ACCESS_MEDIA_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_ACCESS_MEDIA_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = payloadHash(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, custodyId);
    const register = registerFromTask(task);
    const replay = replayOrConflict(register, evidenceId, eventName, hash);
    if (replay) return response(task, register, { replay_safe: true });
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_ACCESS_MEDIA_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_ACCESS_MEDIA_STALE_VERSION");
    const produced = await producer({ task, register, auth, occurredAt, evidenceId, hash });
    const next = {
      ...register,
      ...object(produced.patch),
      contract: CONTRACT,
      version: expectedVersion + 1,
      history: [...register.history, {
        event: eventName,
        evidence_id: evidenceId,
        occurred_at: occurredAt,
        recorded_by_party_id: auth.actor,
        payload_sha256: hash,
        ...object(produced.historyDetails),
        ...safetyFlags(),
      }].slice(-500),
      ...safetyFlags(),
    };
    const terminal = next.state === "CANCELLED";
    const dueAt = next.state === "ISSUED" ? next.expected_return_at : next.state === "IN_TRANSFER" ? next.pending_transfer?.acknowledgement_due_at || null : null;
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: terminal ? "CANCELLED" : "IN_PROGRESS",
        completed_at: terminal ? occurredAt : null,
        due_at: dueAt,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_access_media_custody_contract: CONTRACT,
          secretary_access_media_custody_state: next.state,
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
    if (updated.error) throw updated.error;
    if (!updated.data) continue;
    if (produced.cancelAll === true || terminal) await cancelPendingFollowUps(updated.data, produced.cancelReason || "Access-media custody tracking state changed.");
    else if (produced.cancelKinds?.length) await cancelPendingFollowUps(updated.data, produced.cancelReason || "Access-media custody evidence changed.", produced.cancelKinds);
    return response(updated.data, next, { replay_safe: false });
  }
  throw new Error("SECRETARY_ACCESS_MEDIA_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function registerSecretaryAccessMediaCustody({ context, payload = {} } = {}) {
  assertNoCredentialSecret(payload);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_ACCESS_MEDIA_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const auth = await routingFor({ context, instruction: "Register physical custody of a key, access card, badge, fob, token, or other access medium without changing access permissions", at: occurredAt });
  const label = text(payload.label, 1000);
  if (!label) throw new Error("SECRETARY_ACCESS_MEDIA_LABEL_REQUIRED");
  const kind = text(payload.media_kind || payload.mediaKind || "OTHER", 80).toUpperCase();
  if (!MEDIA_KINDS.has(kind)) throw new Error("SECRETARY_ACCESS_MEDIA_KIND_INVALID");
  const storageLocation = text(payload.storage_location || payload.storageLocation, 1200);
  if (!storageLocation) throw new Error("SECRETARY_ACCESS_MEDIA_STORAGE_LOCATION_REQUIRED");
  const hash = payloadHash(payload);
  const custodyId = deterministicUuid(`avantiqo-secretary-access-media-custody-v1:${auth.organization}:${evidenceId}`);
  const existing = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", auth.organization).eq("id", custodyId).maybeSingle());
  if (existing) {
    const register = registerFromTask(existing);
    const replay = replayOrConflict(register, evidenceId, "REGISTERED", hash);
    if (!replay) throw new Error("SECRETARY_ACCESS_MEDIA_EVIDENCE_REUSE_CONFLICT");
    return response(existing, register, { replay_safe: true });
  }
  const register = {
    contract: CONTRACT,
    custody_id: custodyId,
    state: "STORED",
    version: 1,
    label,
    media_kind: kind,
    media_reference: text(payload.media_reference || payload.mediaReference, 1000) || null,
    home_storage_location: storageLocation,
    current_storage_location: storageLocation,
    current_holder_party_id: null,
    expected_return_at: null,
    pending_transfer: null,
    last_known_holder_party_id: null,
    last_known_location: storageLocation,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    created_at: occurredAt,
    history: [{ event: "REGISTERED", evidence_id: evidenceId, occurred_at: occurredAt, recorded_by_party_id: auth.actor, payload_sha256: hash, storage_location: storageLocation, ...safetyFlags() }],
    custody_history: [{ state: "STORED", occurred_at: occurredAt, evidence_id: evidenceId, storage_location: storageLocation }],
    missing_history: [],
    ...safetyFlags(),
  };
  const task = await one(supabaseAdmin.from("secretary_tasks").insert({
    id: custodyId,
    organization_id: auth.organization,
    owner_party_id: auth.operational,
    title: `Access media custody: ${label}`,
    details: "Track physical custody evidence only. Do not grant/revoke access, activate/deactivate credentials, or store credential secrets.",
    status: "IN_PROGRESS",
    priority: "NORMAL",
    source: SOURCE,
    created_by_party_id: auth.actor,
    metadata: {
      [REGISTER_KEY]: register,
      secretary_access_media_custody_contract: CONTRACT,
      secretary_access_media_custody_state: register.state,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      ...safetyFlags(),
    },
  }).select("*").single());
  return response(task, register, { replay_safe: false });
}

export async function issueSecretaryAccessMedia({ context, payload = {} } = {}) {
  return mutate({ context, payload, eventName: "ISSUED", instruction: "Record explicit physical handoff of access media to a holder; do not grant or activate access", allowedStates: new Set(["STORED"]), producer: async ({ register, auth, occurredAt, evidenceId }) => {
    const holder = await ensureParty(auth.organization, payload.holder_party_id || payload.holderPartyId, "holder");
    const sourceReference = requiredSourceReference(payload);
    const expectedReturnAt = iso(payload.expected_return_at || payload.expectedReturnAt, "expected_return_at", false);
    return {
      patch: {
        state: "ISSUED",
        current_holder_party_id: holder.id,
        current_storage_location: null,
        expected_return_at: expectedReturnAt,
        pending_transfer: null,
        last_known_holder_party_id: holder.id,
        last_known_location: null,
        custody_history: [...register.custody_history, { state: "ISSUED", occurred_at: occurredAt, evidence_id: evidenceId, holder_party_id: holder.id, source_reference: sourceReference, expected_return_at: expectedReturnAt }].slice(-500),
      },
      historyDetails: { holder_party_id: holder.id, source_reference: sourceReference, expected_return_at: expectedReturnAt },
      cancelAll: true,
      cancelReason: "Access media issued to explicit holder.",
    };
  } });
}

export async function initiateSecretaryAccessMediaTransfer({ context, payload = {} } = {}) {
  return mutate({ context, payload, eventName: "TRANSFER_INITIATED", instruction: "Record an explicit physical access-media transfer pending target acknowledgement; do not change access permissions", allowedStates: new Set(["ISSUED"]), producer: async ({ register, auth, occurredAt, evidenceId }) => {
    const target = await ensureParty(auth.organization, payload.to_party_id || payload.toPartyId, "transfer_target");
    if (target.id === register.current_holder_party_id) throw new Error("SECRETARY_ACCESS_MEDIA_TRANSFER_TARGET_SAME_AS_HOLDER");
    const sourceReference = requiredSourceReference(payload);
    const acknowledgementDueAt = iso(payload.acknowledgement_due_at || payload.acknowledgementDueAt, "acknowledgement_due_at");
    return {
      patch: {
        state: "IN_TRANSFER",
        pending_transfer: {
          from_party_id: register.current_holder_party_id,
          to_party_id: target.id,
          initiated_at: occurredAt,
          evidence_id: evidenceId,
          source_reference: sourceReference,
          acknowledgement_due_at: acknowledgementDueAt,
        },
        last_known_holder_party_id: register.current_holder_party_id,
        custody_history: [...register.custody_history, { state: "IN_TRANSFER", occurred_at: occurredAt, evidence_id: evidenceId, from_party_id: register.current_holder_party_id, to_party_id: target.id, source_reference: sourceReference, acknowledgement_due_at: acknowledgementDueAt }].slice(-500),
      },
      historyDetails: { from_party_id: register.current_holder_party_id, to_party_id: target.id, source_reference: sourceReference, acknowledgement_due_at: acknowledgementDueAt },
      cancelKinds: ["RETURN_DUE"],
      cancelReason: "Access media entered explicit transfer workflow.",
    };
  } });
}

export async function acknowledgeSecretaryAccessMediaTransfer({ context, payload = {} } = {}) {
  return mutate({ context, payload, eventName: "TRANSFER_ACKNOWLEDGED", instruction: "Record explicit target acknowledgement of physical access-media custody; do not infer access rights", allowedStates: new Set(["IN_TRANSFER"]), producer: async ({ register, auth, occurredAt, evidenceId }) => {
    const pending = object(register.pending_transfer);
    if (!pending.to_party_id) throw new Error("SECRETARY_ACCESS_MEDIA_TRANSFER_PENDING_REQUIRED");
    const acknowledgedBy = await ensureParty(auth.organization, payload.acknowledged_by_party_id || payload.acknowledgedByPartyId, "acknowledger");
    if (acknowledgedBy.id !== pending.to_party_id) throw new Error("SECRETARY_ACCESS_MEDIA_TRANSFER_ACK_TARGET_MISMATCH");
    const sourceReference = requiredSourceReference(payload);
    return {
      patch: {
        state: "ISSUED",
        current_holder_party_id: acknowledgedBy.id,
        current_storage_location: null,
        pending_transfer: null,
        last_known_holder_party_id: acknowledgedBy.id,
        last_known_location: null,
        custody_history: [...register.custody_history, { state: "ISSUED", occurred_at: occurredAt, evidence_id: evidenceId, holder_party_id: acknowledgedBy.id, source_reference: sourceReference, transfer_acknowledged: true }].slice(-500),
      },
      historyDetails: { acknowledged_by_party_id: acknowledgedBy.id, source_reference: sourceReference },
      cancelKinds: ["TRANSFER_ACK"],
      cancelReason: "Explicit transfer acknowledgement recorded.",
    };
  } });
}

export async function returnSecretaryAccessMediaToStorage({ context, payload = {} } = {}) {
  return mutate({ context, payload, eventName: "RETURNED_TO_STORAGE", instruction: "Record explicit physical return of access media to storage; do not revoke or deactivate access", allowedStates: new Set(["ISSUED"]), producer: async ({ register, occurredAt, evidenceId }) => {
    const sourceReference = requiredSourceReference(payload);
    const storageLocation = text(payload.storage_location || payload.storageLocation, 1200);
    if (!storageLocation) throw new Error("SECRETARY_ACCESS_MEDIA_STORAGE_LOCATION_REQUIRED");
    return {
      patch: {
        state: "STORED",
        current_holder_party_id: null,
        current_storage_location: storageLocation,
        expected_return_at: null,
        pending_transfer: null,
        last_known_holder_party_id: register.current_holder_party_id,
        last_known_location: storageLocation,
        custody_history: [...register.custody_history, { state: "STORED", occurred_at: occurredAt, evidence_id: evidenceId, storage_location: storageLocation, source_reference: sourceReference }].slice(-500),
      },
      historyDetails: { storage_location: storageLocation, source_reference: sourceReference },
      cancelAll: true,
      cancelReason: "Access media returned to explicit storage location.",
    };
  } });
}

export async function markSecretaryAccessMediaMissing({ context, payload = {} } = {}) {
  return mutate({ context, payload, eventName: "MISSING_REPORTED", instruction: "Record an explicit missing access-media exception; do not infer missing status or declare a security incident", producer: async ({ register, occurredAt, evidenceId }) => {
    const sourceReference = requiredSourceReference(payload);
    return {
      patch: {
        state: "MISSING",
        missing_from_state: register.state,
        missing_reported_at: occurredAt,
        missing_source_reference: sourceReference,
        missing_history: [...register.missing_history, { event: "MISSING_REPORTED", occurred_at: occurredAt, evidence_id: evidenceId, from_state: register.state, source_reference: sourceReference, last_known_holder_party_id: register.current_holder_party_id || register.last_known_holder_party_id || null, last_known_location: register.current_storage_location || register.last_known_location || null }].slice(-500),
      },
      historyDetails: { from_state: register.state, source_reference: sourceReference },
      cancelAll: true,
      cancelReason: "Explicit missing access-media evidence recorded.",
    };
  } });
}

export async function recoverSecretaryAccessMedia({ context, payload = {} } = {}) {
  return mutate({ context, payload, eventName: "RECOVERED", instruction: "Record explicit recovery of previously missing access media into storage; do not activate/deactivate credentials", allowedStates: new Set(["MISSING"]), producer: async ({ register, occurredAt, evidenceId }) => {
    const sourceReference = requiredSourceReference(payload);
    const storageLocation = text(payload.storage_location || payload.storageLocation, 1200);
    if (!storageLocation) throw new Error("SECRETARY_ACCESS_MEDIA_STORAGE_LOCATION_REQUIRED");
    return {
      patch: {
        state: "STORED",
        current_holder_party_id: null,
        current_storage_location: storageLocation,
        expected_return_at: null,
        pending_transfer: null,
        last_known_location: storageLocation,
        missing_reported_at: null,
        missing_source_reference: null,
        missing_history: [...register.missing_history, { event: "RECOVERED", occurred_at: occurredAt, evidence_id: evidenceId, storage_location: storageLocation, source_reference: sourceReference }].slice(-500),
        custody_history: [...register.custody_history, { state: "STORED", occurred_at: occurredAt, evidence_id: evidenceId, storage_location: storageLocation, source_reference: sourceReference, recovered: true }].slice(-500),
      },
      historyDetails: { storage_location: storageLocation, source_reference: sourceReference },
      cancelAll: true,
      cancelReason: "Explicit access-media recovery evidence recorded.",
    };
  } });
}

export async function refreshSecretaryAccessMediaCustody({ context, payload = {} } = {}) {
  assertNoCredentialSecret(payload);
  const organization = organizationId(context);
  const custodyId = text(payload.custody_id || payload.custodyId, 120);
  if (!custodyId) throw new Error("SECRETARY_ACCESS_MEDIA_CUSTODY_ID_REQUIRED");
  const task = await readTask(organization, custodyId);
  const register = registerFromTask(task);
  const auth = await routingFor({ context, instruction: "Refresh deterministic access-media custody return or transfer-acknowledgement follow-ups", at: new Date().toISOString() });
  const followUps = [];
  if (register.state === "ISSUED" && register.current_holder_party_id && register.expected_return_at) {
    const followUp = await ensureFollowUp({
      task,
      register,
      kind: "RETURN_DUE",
      dueAt: register.expected_return_at,
      targetPartyId: register.current_holder_party_id,
      actor: auth.actor,
      routing: auth.routing,
      instruction: `Request explicit return/handoff evidence for access media ${register.label}. Do not infer missing status from silence or overdue timing, and do not revoke/deactivate access.`,
    });
    if (followUp) followUps.push(followUp);
  }
  if (register.state === "IN_TRANSFER" && register.pending_transfer?.to_party_id && register.pending_transfer?.acknowledgement_due_at) {
    const followUp = await ensureFollowUp({
      task,
      register,
      kind: "TRANSFER_ACK",
      dueAt: register.pending_transfer.acknowledgement_due_at,
      targetPartyId: register.pending_transfer.to_party_id,
      actor: auth.actor,
      routing: auth.routing,
      instruction: `Request explicit target acknowledgement of physical custody for access media ${register.label}. Do not treat silence as acknowledgement and do not grant/revoke access.`,
    });
    if (followUp) followUps.push(followUp);
  }
  return response(task, register, { follow_up_count: followUps.length, follow_up_ids: followUps.map((row) => row.id) });
}

export async function cancelSecretaryAccessMediaCustody({ context, payload = {} } = {}) {
  return mutate({ context, payload, eventName: "TRACKING_CANCELLED", instruction: "Cancel only Secretary access-media custody tracking; do not revoke access, deactivate credentials, or alter security-system state", producer: async () => ({
    patch: { state: "CANCELLED" },
    historyDetails: { reason: text(payload.reason, 1200) || null },
    cancelAll: true,
    cancelReason: "Secretary access-media custody tracking cancelled only.",
  }) });
}

export async function readSecretaryAccessMediaCustody({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const custodyId = text(payload.custody_id || payload.custodyId, 120);
  if (!custodyId) throw new Error("SECRETARY_ACCESS_MEDIA_CUSTODY_ID_REQUIRED");
  const task = await readTask(organization, custodyId);
  return response(task, registerFromTask(task));
}

export async function listSecretaryAccessMediaCustody({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const rows = await many(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("source", SOURCE).order("created_at", { ascending: false }).limit(Math.min(Math.max(Number(payload.limit) || 100, 1), 500)));
  const items = rows.map((task) => ({ custody: task, record: registerFromTask(task), ...currentTemporalState(registerFromTask(task)), ...safetyFlags() }));
  return { status: "completed", contract: CONTRACT, items, count: items.length, ...safetyFlags() };
}

export const SECRETARY_ACCESS_MEDIA_CUSTODY_CONTRACT = CONTRACT;
