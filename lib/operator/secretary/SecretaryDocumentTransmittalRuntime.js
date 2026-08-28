import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DOCUMENT_TRANSMITTAL_V1";
const SOURCE = "secretary_document_transmittal";
const REGISTER_KEY = "document_transmittal_v1";
const CHANNELS = new Set(["EMAIL", "MESSAGE", "PORTAL", "COURIER", "HAND", "OTHER"]);
const DISTRIBUTION_STATES = new Set(["SENT", "DELIVERED", "FAILED"]);
const MUTABLE_STATES = new Set(["PREPARED", "IN_DISTRIBUTION"]);

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function many(result) { const resolved = await result; if (resolved.error) throw resolved.error; return Array.isArray(resolved.data) ? resolved.data : []; }
function organizationId(context = {}) { const id = text(context.organizationId, 120); if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED"); return id; }
function actorPartyId(context = {}) { const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120); if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED"); return id; }
function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) { if (required) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_${field.toUpperCase()}_REQUIRED`); return null; }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_${field.toUpperCase()}_INVALID`);
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
function sha256(value) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function safetyFlags() {
  return {
    document_store_created: false,
    file_content_read: false,
    external_storage_access_performed: false,
    access_permission_bypassed: false,
    external_message_sent_by_runtime: false,
    external_delivery_performed_by_runtime: false,
    distribution_delivery_inferred: false,
    acknowledgement_inferred: false,
    acknowledgement_is_approval: false,
    acknowledgement_is_acceptance: false,
    acknowledgement_is_signature: false,
    acknowledgement_is_legal_service: false,
    legal_effect_inferred: false,
    source_document_modified: false,
    source_document_deleted: false,
    retention_decision_made: false,
    legal_hold_changed: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
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
  if (routing.coverage_routing_review_required === true) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function ensureParty(organization, partyId) {
  const id = text(partyId, 120);
  if (!id) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECIPIENT_PARTY_REQUIRED");
  const party = await one(supabaseAdmin.from("parties").select("id,display_name,status").eq("organization_id", organization).eq("id", id).maybeSingle());
  if (!party || party.status !== "ACTIVE") throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECIPIENT_PARTY_NOT_FOUND");
  return party;
}

function normalizeChannel(value) {
  const channel = text(value || "OTHER", 40).toUpperCase();
  if (!CHANNELS.has(channel)) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_CHANNEL_INVALID");
  return channel;
}

async function resolveFiledDocument(organization, entry, index) {
  const row = object(entry);
  const filingId = text(row.document_filing_id || row.documentFilingId, 120);
  if (!filingId) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_DOCUMENT_FILING_ID_REQUIRED:${index}`);
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("id,source,metadata,status")
      .eq("organization_id", organization)
      .eq("id", filingId)
      .eq("source", "secretary_document_filing")
      .maybeSingle(),
  );
  if (!task) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_DOCUMENT_FILING_NOT_FOUND:${index}`);
  const metadata = object(task.metadata);
  if (metadata.document_status === "CANCELLED") throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_DOCUMENT_CANCELLED:${index}`);
  const requestedVersionRaw = row.document_version ?? row.documentVersion;
  const requestedVersion = requestedVersionRaw === undefined || requestedVersionRaw === null || requestedVersionRaw === ""
    ? Number(metadata.current_version || 0)
    : Number(requestedVersionRaw);
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_DOCUMENT_VERSION_INVALID:${index}`);
  const version = list(metadata.versions).find((item) => Number(item.version) === requestedVersion);
  if (!version || !text(version.source_reference, 1800)) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_DOCUMENT_VERSION_NOT_FOUND:${index}`);
  return {
    document_filing_id: task.id,
    document_key: metadata.document_key || null,
    document_title: metadata.document_title || null,
    document_type: metadata.document_type || null,
    category: metadata.category || null,
    version: requestedVersion,
    source_reference: version.source_reference,
    canonical_filename: version.canonical_filename || null,
    filing_path: version.filing_path || null,
    checksum_reference: version.checksum_reference || null,
  };
}

async function normalizeDocuments(organization, documents) {
  const input = list(documents).slice(0, 100);
  if (!input.length) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_DOCUMENT_REQUIRED");
  const rows = [];
  const seen = new Set();
  for (let index = 0; index < input.length; index += 1) {
    const resolved = await resolveFiledDocument(organization, input[index], index);
    const key = `${resolved.document_filing_id}:${resolved.version}`;
    if (seen.has(key)) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_DOCUMENT_DUPLICATE");
    seen.add(key);
    rows.push(resolved);
  }
  return rows;
}

async function normalizeRecipients(organization, recipients, distributionDueAt, acknowledgementDueAt) {
  const input = list(recipients).slice(0, 100);
  if (!input.length) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECIPIENT_REQUIRED");
  const rows = [];
  const seen = new Set();
  for (let index = 0; index < input.length; index += 1) {
    const row = object(input[index]);
    const party = await ensureParty(organization, row.party_id || row.partyId);
    if (seen.has(party.id)) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECIPIENT_DUPLICATE");
    seen.add(party.id);
    const requiredAck = row.required_ack !== false && row.requiredAck !== false;
    const recipientDistributionDue = iso(row.distribution_due_at || row.distributionDueAt || distributionDueAt, "distribution_due_at");
    const recipientAckDue = requiredAck
      ? iso(row.acknowledgement_due_at || row.acknowledgementDueAt || acknowledgementDueAt, "acknowledgement_due_at")
      : null;
    if (recipientAckDue && Date.parse(recipientAckDue) <= Date.parse(recipientDistributionDue)) {
      throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_ACK_DUE_MUST_FOLLOW_DISTRIBUTION_DUE");
    }
    rows.push({
      party_id: party.id,
      channel: normalizeChannel(row.channel),
      required_ack: requiredAck,
      distribution_due_at: recipientDistributionDue,
      acknowledgement_due_at: recipientAckDue,
      distribution_status: "NOT_DISTRIBUTED",
      distributed_at: null,
      distribution_evidence_id: null,
      distribution_source_reference: null,
      acknowledgement_status: requiredAck ? "PENDING" : "NOT_REQUIRED",
      acknowledged_at: null,
      acknowledgement_evidence_id: null,
      acknowledgement_source_reference: null,
    });
  }
  return rows;
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECORD_INVALID");
  return {
    ...register,
    documents: list(register.documents),
    recipients: list(register.recipients),
    frozen_versions: list(register.frozen_versions),
    history: list(register.history),
  };
}
async function readTask(organization, transmittalId) {
  const task = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("id", transmittalId).maybeSingle());
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_NOT_FOUND");
  return task;
}
function snapshot(register, evidenceId, occurredAt) {
  return {
    transmittal_version: register.transmittal_version,
    title: register.title,
    documents: register.documents,
    recipients: register.recipients,
    frozen_at: occurredAt,
    evidence_id: evidenceId,
    content_sha256: sha256({ title: register.title, documents: register.documents, recipients: register.recipients }),
  };
}
function response(task, register, extra = {}) { return { status: "completed", contract: CONTRACT, transmittal: task, record: register, ...extra, ...safetyFlags() }; }
function followUpId(transmittalId, version, kind, recipientPartyId) {
  return deterministicUuid(`avantiqo-secretary-document-transmittal-follow-up-v1:${transmittalId}:${version}:${kind}:${recipientPartyId}`);
}

async function ensureFollowUp({ task, register, recipient, kind, dueAt, instruction }) {
  const id = followUpId(task.id, register.transmittal_version, kind, recipient.party_id);
  const existing = await one(supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", task.organization_id).eq("id", id).maybeSingle());
  if (existing) return existing;
  const actionType = recipient.channel === "EMAIL" ? "EMAIL" : recipient.channel === "MESSAGE" ? "MESSAGE" : recipient.channel === "COURIER" ? "OTHER" : "REVIEW";
  return one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      id,
      organization_id: task.organization_id,
      entity_id: task.entity_id || null,
      owner_party_id: task.owner_party_id,
      contact_party_id: recipient.party_id,
      task_id: task.id,
      action_type: actionType,
      reason: instruction,
      status: "PENDING",
      due_at: dueAt,
      created_by_party_id: task.created_by_party_id || task.owner_party_id,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: false,
        execution_instruction: instruction,
        secretary_owned: true,
        secretary_document_transmittal: true,
        secretary_document_transmittal_contract: CONTRACT,
        secretary_document_transmittal_kind: kind,
        secretary_document_transmittal_recipient_party_id: recipient.party_id,
        secretary_document_transmittal_version: register.transmittal_version,
        requires_governed_delivery_path: true,
        acknowledgement_is_approval: false,
        acknowledgement_is_acceptance: false,
        acknowledgement_is_signature: false,
        acknowledgement_is_legal_service: false,
        external_authority_used: false,
      },
    }).select("*").single(),
  );
}

async function cancelFollowUps(task, { kinds = null, recipientPartyId = null, reason = "Superseded document-transmittal follow-up." } = {}) {
  const rows = await many(supabaseAdmin.from("secretary_follow_ups").select("id,metadata").eq("organization_id", task.organization_id).eq("task_id", task.id).eq("status", "PENDING").limit(500));
  const allowed = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_document_transmittal_contract !== CONTRACT) return false;
    if (allowed && !allowed.has(text(metadata.secretary_document_transmittal_kind, 80))) return false;
    if (recipientPartyId && text(metadata.secretary_document_transmittal_recipient_party_id, 120) !== text(recipientPartyId, 120)) return false;
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

function replayOrConflict(register, evidenceId, eventName, hash) {
  const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
  if (!replay) return null;
  if (replay.event !== eventName || replay.payload_sha256 !== hash) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_EVIDENCE_REUSE_CONFLICT");
  return replay;
}

async function mutate({ context, payload = {}, eventName, instruction, allowedStates = MUTABLE_STATES, producer }) {
  const transmittalId = text(payload.transmittal_id || payload.transmittalId, 120);
  if (!transmittalId) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = sha256(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, transmittalId);
    const register = registerFromTask(task);
    const replay = replayOrConflict(register, evidenceId, eventName, hash);
    if (replay) return response(task, register, { replay_safe: true });
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_STALE_VERSION");
    const produced = await producer({ task, register, auth, occurredAt, evidenceId });
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
    const terminal = next.state === "COMPLETED" || next.state === "CANCELLED";
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: next.state === "COMPLETED" ? "DONE" : next.state === "CANCELLED" ? "CANCELLED" : "IN_PROGRESS",
        completed_at: terminal ? occurredAt : null,
        due_at: terminal ? null : next.recipients.map((row) => row.distribution_due_at).filter(Boolean).sort()[0] || null,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_document_transmittal_contract: CONTRACT,
          secretary_document_transmittal_state: next.state,
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
    if (produced.cancelAllFollowUps) await cancelFollowUps(updated.data, { reason: produced.cancelReason });
    if (produced.cancelRecipientKinds?.length) await cancelFollowUps(updated.data, { kinds: produced.cancelRecipientKinds, recipientPartyId: produced.cancelRecipientPartyId, reason: produced.cancelReason });
    return response(updated.data, next, { replay_safe: false });
  }
  throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryDocumentTransmittal({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const auth = await routingFor({ context, instruction: "Prepare a reference-only document transmittal register; actual external delivery must use an existing governed delivery path", at: occurredAt });
  const title = text(payload.title, 1000);
  if (!title) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_TITLE_REQUIRED");
  const distributionDueAt = iso(payload.distribution_due_at || payload.distributionDueAt, "distribution_due_at");
  const acknowledgementDueAt = iso(payload.acknowledgement_due_at || payload.acknowledgementDueAt, "acknowledgement_due_at", false);
  const documents = await normalizeDocuments(auth.organization, payload.documents);
  const recipients = await normalizeRecipients(auth.organization, payload.recipients, distributionDueAt, acknowledgementDueAt);
  const transmittalId = deterministicUuid(`avantiqo-secretary-document-transmittal-v1:${auth.organization}:${evidenceId}`);
  const hash = sha256(payload);
  const existing = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", auth.organization).eq("id", transmittalId).maybeSingle());
  if (existing) {
    const register = registerFromTask(existing);
    const replay = replayOrConflict(register, evidenceId, "STARTED", hash);
    if (!replay) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_EVIDENCE_REUSE_CONFLICT");
    return response(existing, register, { replay_safe: true });
  }
  const base = {
    contract: CONTRACT,
    transmittal_id: transmittalId,
    title,
    state: "PREPARED",
    version: 1,
    transmittal_version: 1,
    documents,
    recipients,
    frozen_versions: [],
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    history: [],
    ...safetyFlags(),
  };
  base.frozen_versions = [snapshot(base, evidenceId, occurredAt)];
  base.history = [{ event: "STARTED", evidence_id: evidenceId, occurred_at: occurredAt, recorded_by_party_id: auth.actor, payload_sha256: hash, transmittal_version: 1, ...safetyFlags() }];
  const task = await one(supabaseAdmin.from("secretary_tasks").insert({
    id: transmittalId,
    organization_id: auth.organization,
    owner_party_id: auth.operational,
    title: `Document transmittal: ${title}`,
    details: "Reference-only distribution and acknowledgement register. No external delivery is performed by this runtime.",
    status: "IN_PROGRESS",
    priority: "NORMAL",
    due_at: recipients.map((row) => row.distribution_due_at).sort()[0] || null,
    source: SOURCE,
    created_by_party_id: auth.actor,
    metadata: {
      [REGISTER_KEY]: base,
      secretary_document_transmittal_contract: CONTRACT,
      secretary_document_transmittal_state: base.state,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      ...safetyFlags(),
    },
  }).select("*").single());
  return response(task, base, { replay_safe: false });
}

export async function reviseSecretaryDocumentTransmittal({ context, payload = {} } = {}) {
  return mutate({
    context,
    payload,
    eventName: "REVISED",
    instruction: "Revise the complete frozen document-transmittal package from explicit document and recipient inputs",
    producer: async ({ register, auth, occurredAt, evidenceId }) => {
      const title = text(payload.title, 1000);
      if (!title) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_TITLE_REQUIRED");
      const distributionDueAt = iso(payload.distribution_due_at || payload.distributionDueAt, "distribution_due_at");
      const acknowledgementDueAt = iso(payload.acknowledgement_due_at || payload.acknowledgementDueAt, "acknowledgement_due_at", false);
      const documents = await normalizeDocuments(auth.organization, payload.documents);
      const recipients = await normalizeRecipients(auth.organization, payload.recipients, distributionDueAt, acknowledgementDueAt);
      const nextContent = { ...register, title, documents, recipients, transmittal_version: Number(register.transmittal_version) + 1 };
      return {
        patch: {
          state: "PREPARED",
          title,
          documents,
          recipients,
          transmittal_version: nextContent.transmittal_version,
          frozen_versions: [...register.frozen_versions, snapshot(nextContent, evidenceId, occurredAt)].slice(-100),
        },
        cancelAllFollowUps: true,
        cancelReason: "Superseded by a new frozen document-transmittal version.",
        historyDetails: { transmittal_version: nextContent.transmittal_version },
      };
    },
  });
}

export async function recordSecretaryDocumentDistribution({ context, payload = {} } = {}) {
  const recipientPartyId = text(payload.recipient_party_id || payload.recipientPartyId, 120);
  const distributionStatus = text(payload.distribution_status || payload.distributionStatus, 40).toUpperCase();
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1800);
  if (!recipientPartyId) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECIPIENT_PARTY_REQUIRED");
  if (!DISTRIBUTION_STATES.has(distributionStatus)) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_DISTRIBUTION_STATUS_INVALID");
  if (!sourceReference) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_DISTRIBUTION_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "DISTRIBUTION_RECORDED",
    instruction: "Record explicit evidence from an already-governed document delivery attempt; do not infer delivery from intent or queue state",
    producer: async ({ register, occurredAt, evidenceId }) => {
      const index = register.recipients.findIndex((row) => row.party_id === recipientPartyId);
      if (index < 0) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECIPIENT_NOT_FOUND");
      const recipients = register.recipients.map((row, recipientIndex) => recipientIndex === index ? {
        ...row,
        distribution_status: distributionStatus,
        distributed_at: occurredAt,
        distribution_evidence_id: evidenceId,
        distribution_source_reference: sourceReference,
        acknowledgement_status: row.required_ack ? "PENDING" : "NOT_REQUIRED",
        acknowledged_at: null,
        acknowledgement_evidence_id: null,
        acknowledgement_source_reference: null,
      } : row);
      return {
        patch: { state: "IN_DISTRIBUTION", recipients },
        cancelRecipientKinds: ["DISTRIBUTION_DUE"],
        cancelRecipientPartyId: recipientPartyId,
        cancelReason: "Explicit distribution attempt evidence recorded.",
        historyDetails: { recipient_party_id: recipientPartyId, distribution_status: distributionStatus, source_reference: sourceReference, transmittal_version: register.transmittal_version },
      };
    },
  });
}

export async function acknowledgeSecretaryDocumentTransmittal({ context, payload = {} } = {}) {
  const recipientPartyId = text(payload.recipient_party_id || payload.recipientPartyId, 120);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1800);
  if (!recipientPartyId) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECIPIENT_PARTY_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_ACK_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "ACKNOWLEDGED",
    instruction: "Record explicit recipient acknowledgement of document receipt only; acknowledgement is not approval, acceptance, signature, legal service, or legal effect",
    producer: async ({ register, occurredAt, evidenceId }) => {
      const index = register.recipients.findIndex((row) => row.party_id === recipientPartyId);
      if (index < 0) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_RECIPIENT_NOT_FOUND");
      const recipient = register.recipients[index];
      if (!recipient.required_ack) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_ACK_NOT_REQUIRED");
      if (!["SENT", "DELIVERED"].includes(recipient.distribution_status)) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_DISTRIBUTION_EVIDENCE_REQUIRED_BEFORE_ACK");
      const recipients = register.recipients.map((row, recipientIndex) => recipientIndex === index ? {
        ...row,
        acknowledgement_status: "ACKNOWLEDGED",
        acknowledged_at: occurredAt,
        acknowledgement_evidence_id: evidenceId,
        acknowledgement_source_reference: sourceReference,
      } : row);
      return {
        patch: { recipients },
        cancelRecipientKinds: ["ACKNOWLEDGEMENT_CHASE"],
        cancelRecipientPartyId: recipientPartyId,
        cancelReason: "Explicit recipient acknowledgement evidence recorded.",
        historyDetails: { recipient_party_id: recipientPartyId, source_reference: sourceReference, transmittal_version: register.transmittal_version },
      };
    },
  });
}

export async function refreshSecretaryDocumentTransmittal({ context, payload = {} } = {}) {
  const transmittalId = text(payload.transmittal_id || payload.transmittalId, 120);
  if (!transmittalId) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_ID_REQUIRED");
  const auth = await routingFor({ context, instruction: "Refresh document-transmittal distribution and acknowledgement follow-through", at: new Date().toISOString() });
  const task = await readTask(auth.organization, transmittalId);
  const register = registerFromTask(task);
  if (!MUTABLE_STATES.has(register.state)) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_STATE_INVALID:${register.state}`);
  const rows = [];
  for (const recipient of register.recipients) {
    if (["NOT_DISTRIBUTED", "FAILED"].includes(recipient.distribution_status)) {
      rows.push(await ensureFollowUp({
        task,
        register,
        recipient,
        kind: "DISTRIBUTION_DUE",
        dueAt: recipient.distribution_due_at,
        instruction: `Coordinate distribution of frozen document transmittal v${register.transmittal_version} \"${register.title}\" to the recorded recipient using the governed ${recipient.channel} delivery path, then record explicit delivery evidence here. This register does not itself send or deliver documents.`,
      }));
    } else if (recipient.required_ack && recipient.acknowledgement_status === "PENDING") {
      rows.push(await ensureFollowUp({
        task,
        register,
        recipient,
        kind: "ACKNOWLEDGEMENT_CHASE",
        dueAt: recipient.acknowledgement_due_at,
        instruction: `Obtain explicit receipt acknowledgement for frozen document transmittal v${register.transmittal_version} \"${register.title}\". Silence, send status, delivery status, or message-open state is not acknowledgement, approval, acceptance, signature, or legal service.`,
      }));
    }
  }
  return response(task, register, { follow_up_count: rows.length, follow_up_ids: rows.map((row) => row.id) });
}

export async function completeSecretaryDocumentTransmittal({ context, payload = {} } = {}) {
  return mutate({
    context,
    payload,
    eventName: "COMPLETED",
    instruction: "Complete document-transmittal tracking only after explicit distribution and required acknowledgement evidence exists",
    producer: async ({ register }) => {
      const distributionBlocked = register.recipients.some((row) => !["SENT", "DELIVERED"].includes(row.distribution_status));
      if (distributionBlocked) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_DISTRIBUTION_INCOMPLETE");
      const ackBlocked = register.recipients.some((row) => row.required_ack && row.acknowledgement_status !== "ACKNOWLEDGED");
      if (ackBlocked) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_ACKNOWLEDGEMENT_INCOMPLETE");
      return {
        patch: { state: "COMPLETED" },
        cancelAllFollowUps: true,
        cancelReason: "Document transmittal completed from explicit distribution and acknowledgement evidence.",
        historyDetails: { transmittal_version: register.transmittal_version },
      };
    },
  });
}

export async function cancelSecretaryDocumentTransmittal({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1200);
  if (!reason) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_CANCEL_REASON_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "CANCELLED",
    instruction: "Cancel only Secretary transmittal tracking; do not retract sent documents, delete files, revoke access, or alter retention/legal-hold status",
    producer: async () => ({
      patch: { state: "CANCELLED" },
      cancelAllFollowUps: true,
      cancelReason: "Document-transmittal tracking cancelled.",
      historyDetails: { reason },
    }),
  });
}

export async function readSecretaryDocumentTransmittal({ context, payload = {} } = {}) {
  const transmittalId = text(payload.transmittal_id || payload.transmittalId, 120);
  if (!transmittalId) throw new Error("SECRETARY_DOCUMENT_TRANSMITTAL_ID_REQUIRED");
  const task = await readTask(organizationId(context), transmittalId);
  return response(task, registerFromTask(task));
}

export async function listSecretaryDocumentTransmittals({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const limit = Math.max(1, Math.min(200, Number(payload.limit) || 50));
  const rows = await many(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("source", SOURCE).order("created_at", { ascending: false }).limit(limit));
  return { status: "completed", contract: CONTRACT, items: rows.map((task) => ({ task, record: registerFromTask(task) })), ...safetyFlags() };
}

export default Object.freeze({
  start: startSecretaryDocumentTransmittal,
  revise: reviseSecretaryDocumentTransmittal,
  recordDistribution: recordSecretaryDocumentDistribution,
  acknowledge: acknowledgeSecretaryDocumentTransmittal,
  refresh: refreshSecretaryDocumentTransmittal,
  complete: completeSecretaryDocumentTransmittal,
  cancel: cancelSecretaryDocumentTransmittal,
  read: readSecretaryDocumentTransmittal,
  list: listSecretaryDocumentTransmittals,
});
