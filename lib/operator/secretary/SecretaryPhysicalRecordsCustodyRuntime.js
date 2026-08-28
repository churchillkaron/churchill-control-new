import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_PHYSICAL_RECORDS_CUSTODY_V1";
const SOURCE = "secretary_physical_records_custody";
const REGISTER_KEY = "physical_records_custody_v1";
const RECORD_KINDS = new Set(["FILE", "FOLDER", "BINDER", "BOX", "OTHER"]);
const ACTIVE_STATES = new Set(["STORED", "CHECKED_OUT", "IN_TRANSFER", "MISSING"]);

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function organizationId(context = {}) { const id = text(context.organizationId, 120); if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED"); return id; }
function actorPartyId(context = {}) { const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120); if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED"); return id; }
function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) { if (required) throw new Error(`SECRETARY_PHYSICAL_RECORDS_${field.toUpperCase()}_REQUIRED`); return null; }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_PHYSICAL_RECORDS_${field.toUpperCase()}_INVALID`);
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
    physical_record_content_read: false,
    external_storage_access_performed: false,
    access_permission_bypassed: false,
    physical_access_granted: false,
    custody_inferred: false,
    missing_status_inferred: false,
    destruction_authorized: false,
    record_destroyed: false,
    retention_decision_made: false,
    archive_deletion_performed: false,
    legal_hold_changed: false,
    external_sharing_performed: false,
    source_document_modified: false,
    source_document_deleted: false,
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
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "DOCUMENT_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) throw new Error(`SECRETARY_PHYSICAL_RECORDS_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_PHYSICAL_RECORDS_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function ensureParty(organization, partyId, field) {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_PHYSICAL_RECORDS_${field.toUpperCase()}_PARTY_REQUIRED`);
  const row = await one(supabaseAdmin.from("parties").select("id,display_name,status").eq("organization_id", organization).eq("id", id).maybeSingle());
  if (!row || row.status !== "ACTIVE") throw new Error(`SECRETARY_PHYSICAL_RECORDS_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return row;
}

async function validateDocumentFilingReference(organization, filingId) {
  const id = text(filingId, 120);
  if (!id) return null;
  const row = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("id,source,status,metadata")
      .eq("organization_id", organization)
      .eq("id", id)
      .eq("source", "secretary_document_filing")
      .maybeSingle(),
  );
  if (!row) throw new Error("SECRETARY_PHYSICAL_RECORDS_DOCUMENT_FILING_REFERENCE_NOT_FOUND");
  return { document_filing_id: row.id, document_key: object(row.metadata).document_key || null, document_title: object(row.metadata).document_title || null };
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_PHYSICAL_RECORDS_RECORD_INVALID");
  return {
    ...register,
    history: list(register.history),
    custody_history: list(register.custody_history),
    location_history: list(register.location_history),
    missing_history: list(register.missing_history),
  };
}
async function readTask(organization, custodyId) {
  const task = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("id", custodyId).maybeSingle());
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_PHYSICAL_RECORDS_NOT_FOUND");
  return task;
}
function currentTemporalState(register, now = new Date()) {
  const at = now instanceof Date ? now.getTime() : Date.parse(String(now));
  const expected = register.expected_return_at ? Date.parse(register.expected_return_at) : NaN;
  return {
    return_overdue_temporal_only: register.state === "CHECKED_OUT" && Number.isFinite(expected) && Number.isFinite(at) && at > expected,
    missing_inferred_from_overdue: false,
  };
}
function response(task, register, extra = {}) { return { status: "completed", contract: CONTRACT, custody: task, record: register, ...currentTemporalState(register), ...extra, ...safetyFlags() }; }
function followUpId(custodyId, kind, version) { return deterministicUuid(`avantiqo-secretary-physical-records-follow-up-v1:${custodyId}:${kind}:${version}`); }

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
  return one(
    supabaseAdmin.from("secretary_follow_ups").insert({
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
        secretary_physical_records_custody: true,
        secretary_physical_records_custody_contract: CONTRACT,
        physical_records_custody_id: task.id,
        physical_records_follow_up_kind: kind,
        canonical_owner_party_id: register.canonical_owner_party_id,
        requires_owner_authority: false,
        ...secretaryAdministrativeCoverageMetadata(routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
}

async function cancelPendingFollowUps(task, reason, kinds = null) {
  const rows = await many(supabaseAdmin.from("secretary_follow_ups").select("id,metadata").eq("organization_id", task.organization_id).eq("task_id", task.id).eq("status", "PENDING").limit(500));
  const allowed = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_physical_records_custody_contract !== CONTRACT) return false;
    return !allowed || allowed.has(text(metadata.physical_records_follow_up_kind, 80));
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
  if (replay.event !== eventName || replay.payload_sha256 !== hash) throw new Error("SECRETARY_PHYSICAL_RECORDS_EVIDENCE_REUSE_CONFLICT");
  return replay;
}

async function mutate({ context, payload, eventName, instruction, allowedStates = ACTIVE_STATES, producer }) {
  const custodyId = text(payload.custody_id || payload.custodyId, 120);
  if (!custodyId) throw new Error("SECRETARY_PHYSICAL_RECORDS_CUSTODY_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_PHYSICAL_RECORDS_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_PHYSICAL_RECORDS_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = payloadHash(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, custodyId);
    const register = registerFromTask(task);
    const replay = replayOrConflict(register, evidenceId, eventName, hash);
    if (replay) return response(task, register, { replay_safe: true });
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_PHYSICAL_RECORDS_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_PHYSICAL_RECORDS_STALE_VERSION");
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
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: terminal ? "CANCELLED" : "IN_PROGRESS",
        completed_at: terminal ? occurredAt : null,
        due_at: next.expected_return_at || next.transfer_ack_due_at || null,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_physical_records_custody_contract: CONTRACT,
          secretary_physical_records_custody_state: next.state,
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
    if (produced.cancelKinds?.length) await cancelPendingFollowUps(updated.data, produced.cancelReason || "Physical-record custody evidence changed.", produced.cancelKinds);
    if (terminal) await cancelPendingFollowUps(updated.data, "Physical-record custody tracking cancelled.");
    return response(updated.data, next, { replay_safe: false });
  }
  throw new Error("SECRETARY_PHYSICAL_RECORDS_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function registerSecretaryPhysicalRecordCustody({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_PHYSICAL_RECORDS_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const auth = await routingFor({ context, instruction: "Register explicit physical-record storage and custody evidence", at: occurredAt });
  const label = text(payload.label, 1000);
  if (!label) throw new Error("SECRETARY_PHYSICAL_RECORDS_LABEL_REQUIRED");
  const kind = text(payload.record_kind || payload.recordKind || "OTHER", 80).toUpperCase();
  if (!RECORD_KINDS.has(kind)) throw new Error("SECRETARY_PHYSICAL_RECORDS_KIND_INVALID");
  const storageLocation = text(payload.storage_location || payload.storageLocation, 1200);
  if (!storageLocation) throw new Error("SECRETARY_PHYSICAL_RECORDS_STORAGE_LOCATION_REQUIRED");
  const filingReference = await validateDocumentFilingReference(auth.organization, payload.document_filing_id || payload.documentFilingId);
  const custodyId = deterministicUuid(`avantiqo-secretary-physical-records-custody-v1:${auth.organization}:${evidenceId}`);
  const existing = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", auth.organization).eq("id", custodyId).maybeSingle());
  if (existing) return response(existing, registerFromTask(existing), { replay_safe: true });
  const register = {
    contract: CONTRACT,
    custody_id: custodyId,
    state: "STORED",
    version: 1,
    label,
    record_kind: kind,
    record_reference: text(payload.record_reference || payload.recordReference, 1200) || null,
    document_filing_reference: filingReference,
    home_storage_location: storageLocation,
    current_storage_location: storageLocation,
    current_holder_party_id: null,
    expected_return_at: null,
    pending_transfer: null,
    transfer_ack_due_at: null,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    custody_history: [],
    location_history: [],
    missing_history: [],
    history: [{ event: "REGISTERED", evidence_id: evidenceId, occurred_at: occurredAt, recorded_by_party_id: auth.actor, payload_sha256: payloadHash(payload), state: "STORED", storage_location: storageLocation, ...safetyFlags() }],
    ...safetyFlags(),
  };
  const task = await one(supabaseAdmin.from("secretary_tasks").insert({
    id: custodyId,
    organization_id: auth.organization,
    owner_party_id: auth.operational,
    title: `Physical record custody: ${label}`,
    details: "Evidence-backed physical-record storage and chain-of-custody tracking only.",
    status: "IN_PROGRESS",
    priority: "NORMAL",
    source: SOURCE,
    created_by_party_id: auth.actor,
    metadata: {
      [REGISTER_KEY]: register,
      secretary_physical_records_custody_contract: CONTRACT,
      secretary_physical_records_custody_state: register.state,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      ...safetyFlags(),
    },
  }).select("*").single());
  return response(task, register, { replay_safe: false });
}

export async function checkoutSecretaryPhysicalRecordCustody({ context, payload = {} } = {}) {
  const holderPartyId = text(payload.holder_party_id || payload.holderPartyId, 120);
  const expectedReturnAt = iso(payload.expected_return_at || payload.expectedReturnAt, "expected_return_at", false);
  return mutate({
    context,
    payload,
    eventName: "CHECKED_OUT",
    instruction: "Record explicit physical-record checkout evidence",
    allowedStates: new Set(["STORED"]),
    producer: async ({ register, auth, occurredAt, evidenceId }) => {
      const holder = await ensureParty(auth.organization, holderPartyId, "holder");
      if (expectedReturnAt && Date.parse(expectedReturnAt) <= Date.parse(occurredAt)) throw new Error("SECRETARY_PHYSICAL_RECORDS_EXPECTED_RETURN_MUST_FOLLOW_CHECKOUT");
      const custodyEntry = { event: "CHECKED_OUT", holder_party_id: holder.id, evidence_id: evidenceId, occurred_at: occurredAt, expected_return_at: expectedReturnAt };
      return {
        patch: {
          state: "CHECKED_OUT",
          current_storage_location: null,
          current_holder_party_id: holder.id,
          expected_return_at: expectedReturnAt,
          pending_transfer: null,
          transfer_ack_due_at: null,
          custody_history: [...register.custody_history, custodyEntry].slice(-100),
          location_history: [...register.location_history, { from: register.current_storage_location, to: null, reason: "CHECKOUT", evidence_id: evidenceId, occurred_at: occurredAt }].slice(-100),
        },
        historyDetails: { holder_party_id: holder.id, expected_return_at: expectedReturnAt },
      };
    },
  });
}

export async function initiateSecretaryPhysicalRecordTransfer({ context, payload = {} } = {}) {
  const targetPartyId = text(payload.target_party_id || payload.targetPartyId, 120);
  const ackDueAt = iso(payload.acknowledgement_due_at || payload.acknowledgementDueAt, "acknowledgement_due_at");
  return mutate({
    context,
    payload,
    eventName: "TRANSFER_INITIATED",
    instruction: "Record an explicit physical-record custody handoff awaiting recipient acknowledgement",
    allowedStates: new Set(["CHECKED_OUT"]),
    producer: async ({ register, auth, occurredAt, evidenceId }) => {
      const target = await ensureParty(auth.organization, targetPartyId, "target");
      if (target.id === register.current_holder_party_id) throw new Error("SECRETARY_PHYSICAL_RECORDS_TRANSFER_TARGET_UNCHANGED");
      if (Date.parse(ackDueAt) <= Date.parse(occurredAt)) throw new Error("SECRETARY_PHYSICAL_RECORDS_ACK_DUE_MUST_FOLLOW_TRANSFER");
      return {
        patch: {
          state: "IN_TRANSFER",
          pending_transfer: {
            from_holder_party_id: register.current_holder_party_id,
            target_party_id: target.id,
            initiated_evidence_id: evidenceId,
            initiated_at: occurredAt,
          },
          transfer_ack_due_at: ackDueAt,
        },
        cancelKinds: ["RETURN_CHASE"],
        cancelReason: "Record is in explicit custody transfer; prior holder return chase superseded.",
        historyDetails: { from_holder_party_id: register.current_holder_party_id, target_party_id: target.id, acknowledgement_due_at: ackDueAt },
      };
    },
  });
}

export async function acknowledgeSecretaryPhysicalRecordTransfer({ context, payload = {} } = {}) {
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1200);
  if (!sourceReference) throw new Error("SECRETARY_PHYSICAL_RECORDS_TRANSFER_ACK_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "TRANSFER_ACKNOWLEDGED",
    instruction: "Record explicit recipient acknowledgement of physical-record custody transfer",
    allowedStates: new Set(["IN_TRANSFER"]),
    producer: async ({ register, occurredAt, evidenceId }) => {
      const pending = object(register.pending_transfer);
      if (!pending.target_party_id) throw new Error("SECRETARY_PHYSICAL_RECORDS_PENDING_TRANSFER_REQUIRED");
      const entry = { event: "TRANSFER_ACKNOWLEDGED", from_holder_party_id: pending.from_holder_party_id || null, holder_party_id: pending.target_party_id, evidence_id: evidenceId, occurred_at: occurredAt, source_reference: sourceReference };
      return {
        patch: {
          state: "CHECKED_OUT",
          current_holder_party_id: pending.target_party_id,
          pending_transfer: null,
          transfer_ack_due_at: null,
          custody_history: [...register.custody_history, entry].slice(-100),
        },
        cancelKinds: ["TRANSFER_ACK_CHASE"],
        cancelReason: "Transfer acknowledgement evidence recorded.",
        historyDetails: { holder_party_id: pending.target_party_id, source_reference: sourceReference },
      };
    },
  });
}

export async function returnSecretaryPhysicalRecordToStorage({ context, payload = {} } = {}) {
  const storageLocation = text(payload.storage_location || payload.storageLocation, 1200);
  if (!storageLocation) throw new Error("SECRETARY_PHYSICAL_RECORDS_STORAGE_LOCATION_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "RETURNED_TO_STORAGE",
    instruction: "Record explicit physical-record return-to-storage evidence",
    allowedStates: new Set(["CHECKED_OUT"]),
    producer: async ({ register, occurredAt, evidenceId }) => ({
      patch: {
        state: "STORED",
        current_storage_location: storageLocation,
        current_holder_party_id: null,
        expected_return_at: null,
        pending_transfer: null,
        transfer_ack_due_at: null,
        custody_history: [...register.custody_history, { event: "RETURNED_TO_STORAGE", from_holder_party_id: register.current_holder_party_id, evidence_id: evidenceId, occurred_at: occurredAt, storage_location: storageLocation }].slice(-100),
        location_history: [...register.location_history, { from: null, to: storageLocation, reason: "RETURN", evidence_id: evidenceId, occurred_at: occurredAt }].slice(-100),
      },
      cancelKinds: ["RETURN_CHASE", "TRANSFER_ACK_CHASE"],
      cancelReason: "Record has explicit return-to-storage evidence.",
      historyDetails: { storage_location: storageLocation, prior_holder_party_id: register.current_holder_party_id },
    }),
  });
}

export async function markSecretaryPhysicalRecordMissing({ context, payload = {} } = {}) {
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1200);
  if (!sourceReference) throw new Error("SECRETARY_PHYSICAL_RECORDS_MISSING_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "MISSING_RECORDED",
    instruction: "Record explicit evidence that a physical record is missing; do not infer missing status from overdue return",
    allowedStates: new Set(["STORED", "CHECKED_OUT", "IN_TRANSFER"]),
    producer: async ({ register, occurredAt, evidenceId }) => ({
      patch: {
        state: "MISSING",
        missing_history: [...register.missing_history, { event: "MISSING_RECORDED", prior_state: register.state, prior_holder_party_id: register.current_holder_party_id, prior_storage_location: register.current_storage_location, source_reference: sourceReference, evidence_id: evidenceId, occurred_at: occurredAt }].slice(-100),
      },
      cancelKinds: ["RETURN_CHASE", "TRANSFER_ACK_CHASE"],
      cancelReason: "Explicit missing-record exception supersedes routine custody chase.",
      historyDetails: { prior_state: register.state, source_reference: sourceReference },
    }),
  });
}

export async function recoverSecretaryPhysicalRecord({ context, payload = {} } = {}) {
  const storageLocation = text(payload.storage_location || payload.storageLocation, 1200);
  if (!storageLocation) throw new Error("SECRETARY_PHYSICAL_RECORDS_STORAGE_LOCATION_REQUIRED");
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1200);
  if (!sourceReference) throw new Error("SECRETARY_PHYSICAL_RECORDS_RECOVERY_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "RECOVERED_TO_STORAGE",
    instruction: "Record explicit recovery and storage evidence for a previously missing physical record",
    allowedStates: new Set(["MISSING"]),
    producer: async ({ register, occurredAt, evidenceId }) => ({
      patch: {
        state: "STORED",
        current_storage_location: storageLocation,
        current_holder_party_id: null,
        expected_return_at: null,
        pending_transfer: null,
        transfer_ack_due_at: null,
        missing_history: [...register.missing_history, { event: "RECOVERED", source_reference: sourceReference, evidence_id: evidenceId, occurred_at: occurredAt, storage_location: storageLocation }].slice(-100),
        location_history: [...register.location_history, { from: null, to: storageLocation, reason: "RECOVERY", evidence_id: evidenceId, occurred_at: occurredAt }].slice(-100),
      },
      historyDetails: { source_reference: sourceReference, storage_location: storageLocation },
    }),
  });
}

export async function refreshSecretaryPhysicalRecordCustody({ context, payload = {} } = {}) {
  const custodyId = text(payload.custody_id || payload.custodyId, 120);
  if (!custodyId) throw new Error("SECRETARY_PHYSICAL_RECORDS_CUSTODY_ID_REQUIRED");
  const organization = organizationId(context);
  const task = await readTask(organization, custodyId);
  const register = registerFromTask(task);
  if (!ACTIVE_STATES.has(register.state)) throw new Error(`SECRETARY_PHYSICAL_RECORDS_STATE_INVALID:${register.state}`);
  const auth = await routingFor({ context, instruction: "Refresh physical-record custody follow-through", at: new Date().toISOString() });
  const rows = [];
  if (register.state === "CHECKED_OUT" && register.expected_return_at && register.current_holder_party_id) {
    rows.push(await ensureFollowUp({
      task,
      register,
      kind: "RETURN_CHASE",
      dueAt: register.expected_return_at,
      targetPartyId: register.current_holder_party_id,
      actor: auth.actor,
      routing: auth.routing,
      instruction: `Confirm the return status of physical record \"${register.label}\" with the recorded holder. Overdue timing alone does not mean the record is missing. Do not grant physical access, destroy records, make retention decisions, or bypass access controls.`,
    }));
  }
  if (register.state === "IN_TRANSFER" && register.transfer_ack_due_at && object(register.pending_transfer).target_party_id) {
    rows.push(await ensureFollowUp({
      task,
      register,
      kind: "TRANSFER_ACK_CHASE",
      dueAt: register.transfer_ack_due_at,
      targetPartyId: object(register.pending_transfer).target_party_id,
      actor: auth.actor,
      routing: auth.routing,
      instruction: `Obtain explicit recipient acknowledgement for custody transfer of physical record \"${register.label}\". Do not infer custody from delivery intent or silence.`,
    }));
  }
  return response(task, register, { follow_up_count: rows.filter(Boolean).length, follow_up_ids: rows.filter(Boolean).map((row) => row.id) });
}

export async function cancelSecretaryPhysicalRecordCustody({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1200);
  if (!reason) throw new Error("SECRETARY_PHYSICAL_RECORDS_CANCEL_REASON_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "TRACKING_CANCELLED",
    instruction: "Cancel only Secretary physical-record custody tracking; do not destroy, delete, dispose, transfer, or alter legal retention status",
    producer: async () => ({ patch: { state: "CANCELLED" }, historyDetails: { reason } }),
  });
}

export async function readSecretaryPhysicalRecordCustody({ context, payload = {} } = {}) {
  const custodyId = text(payload.custody_id || payload.custodyId, 120);
  if (!custodyId) throw new Error("SECRETARY_PHYSICAL_RECORDS_CUSTODY_ID_REQUIRED");
  const task = await readTask(organizationId(context), custodyId);
  return response(task, registerFromTask(task));
}

export async function listSecretaryPhysicalRecordCustody({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const limit = Math.max(1, Math.min(200, Number(payload.limit) || 50));
  const rows = await many(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("source", SOURCE).order("created_at", { ascending: false }).limit(limit));
  return { status: "completed", contract: CONTRACT, items: rows.map((task) => ({ task, record: registerFromTask(task), ...currentTemporalState(registerFromTask(task)) })), ...safetyFlags() };
}

export default Object.freeze({
  register: registerSecretaryPhysicalRecordCustody,
  checkout: checkoutSecretaryPhysicalRecordCustody,
  initiateTransfer: initiateSecretaryPhysicalRecordTransfer,
  acknowledgeTransfer: acknowledgeSecretaryPhysicalRecordTransfer,
  returnToStorage: returnSecretaryPhysicalRecordToStorage,
  markMissing: markSecretaryPhysicalRecordMissing,
  recover: recoverSecretaryPhysicalRecord,
  refresh: refreshSecretaryPhysicalRecordCustody,
  cancel: cancelSecretaryPhysicalRecordCustody,
  read: readSecretaryPhysicalRecordCustody,
  list: listSecretaryPhysicalRecordCustody,
});
