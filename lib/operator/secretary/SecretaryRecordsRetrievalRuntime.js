import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_RECORDS_RETRIEVAL_V1";
const SOURCE = "secretary_records_retrieval";
const REGISTER_KEY = "records_retrieval_v1";
const TERMINAL_STATES = new Set(["FULFILLED", "CANCELLED"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
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
  if (!raw) throw new Error(`SECRETARY_RECORDS_RETRIEVAL_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_RECORDS_RETRIEVAL_${field.toUpperCase()}_INVALID`);
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
    second_document_store_created: false,
    external_storage_access_performed: false,
    file_content_read: false,
    access_permission_bypassed: false,
    confidential_access_inferred: false,
    external_sharing_performed: false,
    source_document_modified: false,
    source_document_deleted: false,
    retention_decision_made: false,
    archive_deletion_performed: false,
    legal_hold_changed: false,
    document_validity_inferred: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
}

function retrievalCriteria(payload = {}) {
  const requestedVersionRaw = payload.requested_version ?? payload.requestedVersion;
  const requestedVersion = requestedVersionRaw === undefined || requestedVersionRaw === null || requestedVersionRaw === ""
    ? null
    : Number(requestedVersionRaw);
  if (requestedVersion !== null && (!Number.isInteger(requestedVersion) || requestedVersion < 1)) {
    throw new Error("SECRETARY_RECORDS_RETRIEVAL_REQUESTED_VERSION_INVALID");
  }
  const criteria = {
    document_id: text(payload.document_id || payload.documentId, 120) || null,
    document_key: text(payload.document_key || payload.documentKey, 700) || null,
    query: text(payload.query, 600) || null,
    category: text(payload.category, 160) || null,
    document_type: text(payload.document_type || payload.documentType, 160) || null,
    subject_reference: text(payload.subject_reference || payload.subjectReference, 700) || null,
    requested_version: requestedVersion,
  };
  if (!Object.values(criteria).some((value) => value !== null)) {
    throw new Error("SECRETARY_RECORDS_RETRIEVAL_CRITERIA_REQUIRED");
  }
  return criteria;
}

async function routingFor({ context, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "DOCUMENT_COORDINATION",
    instruction: "Locate a registered Secretary document reference from explicit retrieval criteria. Do not bypass access controls, read external file content, share externally, delete records, or make retention decisions.",
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_RECORDS_RETRIEVAL_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_RECORDS_RETRIEVAL_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function filingMetadata(row) {
  return object(row?.metadata);
}

function candidateSummary(row) {
  const metadata = filingMetadata(row);
  return {
    document_id: row.id,
    document_key: metadata.document_key || null,
    document_title: metadata.document_title || null,
    document_status: metadata.document_status || null,
    category: metadata.category || null,
    document_type: metadata.document_type || null,
    subject_reference: metadata.subject_reference || null,
    filing_folder: metadata.filing_folder || null,
    current_version: Number(metadata.current_version || 0),
  };
}

function currentVersion(metadata) {
  const versions = list(metadata.versions);
  const currentNumber = Number(metadata.current_version || 0);
  return versions.find((row) => row.status === "CURRENT") || versions.find((row) => Number(row.version) === currentNumber) || null;
}

function selectedVersion(metadata, requestedVersion) {
  if (requestedVersion === null) return currentVersion(metadata);
  return list(metadata.versions).find((row) => Number(row.version) === requestedVersion) || null;
}

function locatedReference(row, version) {
  const metadata = filingMetadata(row);
  return {
    document_id: row.id,
    document_key: metadata.document_key || null,
    document_title: metadata.document_title || null,
    document_status: metadata.document_status || null,
    document_type: metadata.document_type || null,
    category: metadata.category || null,
    subject_reference: metadata.subject_reference || null,
    filing_folder: metadata.filing_folder || null,
    version: Number(version.version),
    version_status: version.status || null,
    source_reference: version.source_reference || null,
    original_filename: version.original_filename || null,
    canonical_filename: version.canonical_filename || null,
    filing_path: version.filing_path || null,
    checksum_reference: version.checksum_reference || null,
    filed_at: version.filed_at || null,
  };
}

async function searchFilingRegister({ organization, criteria }) {
  let rows;
  if (criteria.document_id) {
    const row = await one(
      supabaseAdmin.from("secretary_tasks")
        .select("id,status,source,metadata,created_at,updated_at")
        .eq("organization_id", organization)
        .eq("id", criteria.document_id)
        .eq("source", "secretary_document_filing")
        .maybeSingle(),
    );
    rows = row ? [row] : [];
  } else {
    rows = await many(
      supabaseAdmin.from("secretary_tasks")
        .select("id,status,source,metadata,created_at,updated_at")
        .eq("organization_id", organization)
        .eq("source", "secretary_document_filing")
        .order("updated_at", { ascending: false })
        .limit(500),
    );
  }

  const documentKey = text(criteria.document_key, 700).toLowerCase();
  const query = text(criteria.query, 600).toLowerCase();
  const category = text(criteria.category, 160).toLowerCase();
  const documentType = text(criteria.document_type, 160).toLowerCase();
  const subjectReference = text(criteria.subject_reference, 700).toLowerCase();

  const matches = rows.filter((row) => {
    const metadata = filingMetadata(row);
    if (metadata.document_status === "CANCELLED") return false;
    if (documentKey && text(metadata.document_key, 700).toLowerCase() !== documentKey) return false;
    if (category && text(metadata.category, 160).toLowerCase() !== category) return false;
    if (documentType && text(metadata.document_type, 160).toLowerCase() !== documentType) return false;
    if (subjectReference && text(metadata.subject_reference, 700).toLowerCase() !== subjectReference) return false;
    if (query) {
      const haystack = [
        metadata.document_key,
        metadata.document_title,
        metadata.subject_reference,
        metadata.filing_folder,
        metadata.category,
        metadata.document_type,
      ].map((value) => text(value, 1200).toLowerCase()).join(" ");
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  if (matches.length === 0) {
    return { state: "NOT_FOUND", resolution_reason: "NO_REGISTERED_RECORD_MATCH", candidates: [], located_reference: null };
  }
  if (matches.length > 1) {
    return {
      state: "AMBIGUOUS",
      resolution_reason: "MULTIPLE_REGISTERED_RECORDS_MATCH",
      candidates: matches.slice(0, 20).map(candidateSummary),
      located_reference: null,
    };
  }

  const row = matches[0];
  const metadata = filingMetadata(row);
  const version = selectedVersion(metadata, criteria.requested_version);
  if (!version || !text(version.source_reference, 1800)) {
    return {
      state: "NOT_FOUND",
      resolution_reason: criteria.requested_version === null ? "NO_FILED_VERSION_REFERENCE" : "REQUESTED_VERSION_REFERENCE_NOT_FOUND",
      candidates: [candidateSummary(row)],
      located_reference: null,
    };
  }
  return {
    state: "LOCATED",
    resolution_reason: "REGISTERED_REFERENCE_LOCATED",
    candidates: [candidateSummary(row)],
    located_reference: locatedReference(row, version),
  };
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_RECORDS_RETRIEVAL_RECORD_INVALID");
  return { ...register, history: list(register.history), candidates: list(register.candidates) };
}

async function readTask({ organization, retrievalId }) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", retrievalId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_RECORDS_RETRIEVAL_NOT_FOUND");
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

function replayOrConflict(register, evidenceId, eventName, payloadHash) {
  const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
  if (!replay) return null;
  if (replay.event !== eventName || replay.payload_sha256 !== payloadHash) {
    throw new Error("SECRETARY_RECORDS_RETRIEVAL_EVIDENCE_REUSE_CONFLICT");
  }
  return replay;
}

async function mutateRetrieval({ context, payload, at, evidenceId, eventName, payloadHash, producer }) {
  const retrievalId = text(payload.retrieval_id || payload.retrievalId, 120);
  if (!retrievalId) throw new Error("SECRETARY_RECORDS_RETRIEVAL_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_RECORDS_RETRIEVAL_EXPECTED_VERSION_REQUIRED");
  const auth = await routingFor({ context, at });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask({ organization: auth.organization, retrievalId });
    const register = registerFromTask(task);
    const replay = replayOrConflict(register, evidenceId, eventName, payloadHash);
    if (replay) {
      return { status: "completed", contract: CONTRACT, retrieval: task, record: register, replay_safe: true, ...safetyFlags() };
    }
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_RECORDS_RETRIEVAL_STALE_VERSION");
    if (TERMINAL_STATES.has(register.state)) throw new Error(`SECRETARY_RECORDS_RETRIEVAL_STATE_INVALID:${register.state}`);

    const nextVersion = Number(register.version) + 1;
    const produced = await producer({ task, register, auth, nextVersion });
    const next = {
      ...register,
      ...object(produced.patch),
      version: nextVersion,
      history: [...register.history, produced.historyEntry].slice(-300),
      ...safetyFlags(),
    };
    const result = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: next.state === "FULFILLED" ? "DONE" : next.state === "CANCELLED" ? "CANCELLED" : "IN_PROGRESS",
        completed_at: TERMINAL_STATES.has(next.state) ? at : null,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_records_retrieval_contract: CONTRACT,
          secretary_records_retrieval_state: next.state,
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
    return { status: "completed", contract: CONTRACT, retrieval: result.data, record: next, replay_safe: false, ...safetyFlags() };
  }
  throw new Error("SECRETARY_RECORDS_RETRIEVAL_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function requestSecretaryRecordsRetrieval({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_RECORDS_RETRIEVAL_EVIDENCE_REQUIRED");
  const requestedAt = iso(payload.requested_at || payload.requestedAt, "requested_at");
  const criteria = retrievalCriteria(payload);
  const auth = await routingFor({ context, at: requestedAt });
  const payloadHash = sha256(JSON.stringify({ criteria, requestedAt, evidenceId }));
  const retrievalId = deterministicUuid(`avantiqo-secretary-records-retrieval-v1:${auth.organization}:${evidenceId}`);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", auth.organization)
      .eq("id", retrievalId)
      .maybeSingle(),
  );
  if (existing) {
    const register = registerFromTask(existing);
    const replay = replayOrConflict(register, evidenceId, "RETRIEVAL_REQUESTED", payloadHash);
    if (!replay) throw new Error("SECRETARY_RECORDS_RETRIEVAL_EVIDENCE_REUSE_CONFLICT");
    return { status: "requested", contract: CONTRACT, retrieval: existing, record: register, replay_safe: true, ...safetyFlags() };
  }

  const resolution = await searchFilingRegister({ organization: auth.organization, criteria });
  const register = {
    contract: CONTRACT,
    retrieval_id: retrievalId,
    state: resolution.state,
    version: 1,
    criteria,
    candidates: resolution.candidates,
    located_reference: resolution.located_reference,
    resolution_reason: resolution.resolution_reason,
    requested_at: requestedAt,
    last_resolved_at: requestedAt,
    fulfilled_at: null,
    handoff: null,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    history: [eventEntry({
      event: "RETRIEVAL_REQUESTED",
      evidenceId,
      at: requestedAt,
      actor: auth.actor,
      version: 1,
      payloadHash,
      details: { state: resolution.state, resolution_reason: resolution.resolution_reason, candidate_count: resolution.candidates.length },
    })],
    ...safetyFlags(),
  };

  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: retrievalId,
      organization_id: auth.organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: auth.operational,
      contact_party_id: null,
      title: `Retrieve record: ${criteria.document_key || criteria.query || criteria.subject_reference || criteria.document_id || "registered document"}`,
      details: "Secretary retrieval coordination over the existing Document Filing reference register; no external storage access.",
      status: "IN_PROGRESS",
      priority: text(payload.priority, 40).toUpperCase() || "NORMAL",
      due_at: text(payload.due_at || payload.dueAt, 180) || null,
      remind_at: null,
      completed_at: null,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_records_retrieval_contract: CONTRACT,
        secretary_records_retrieval_state: register.state,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
  return { status: "requested", contract: CONTRACT, retrieval: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function resolveSecretaryRecordsRetrieval({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_RECORDS_RETRIEVAL_EVIDENCE_REQUIRED");
  const resolvedAt = iso(payload.resolved_at || payload.resolvedAt, "resolved_at");
  const selectedDocumentId = text(payload.selected_document_id || payload.selectedDocumentId, 120) || null;
  const selectedVersionRaw = payload.selected_version ?? payload.selectedVersion;
  const selectedVersion = selectedVersionRaw === undefined || selectedVersionRaw === null || selectedVersionRaw === ""
    ? null
    : Number(selectedVersionRaw);
  if (selectedVersion !== null && (!Number.isInteger(selectedVersion) || selectedVersion < 1)) {
    throw new Error("SECRETARY_RECORDS_RETRIEVAL_SELECTED_VERSION_INVALID");
  }
  const payloadHash = sha256(JSON.stringify({ evidenceId, resolvedAt, selectedDocumentId, selectedVersion }));
  return mutateRetrieval({
    context,
    payload,
    at: resolvedAt,
    evidenceId,
    eventName: "RETRIEVAL_RESOLVED",
    payloadHash,
    producer: async ({ register, auth, nextVersion }) => {
      const criteria = selectedDocumentId
        ? { ...register.criteria, document_id: selectedDocumentId, document_key: null, query: null, category: null, document_type: null, subject_reference: null, requested_version: selectedVersion ?? register.criteria.requested_version }
        : { ...register.criteria, requested_version: selectedVersion ?? register.criteria.requested_version };
      const resolution = await searchFilingRegister({ organization: auth.organization, criteria });
      return {
        patch: {
          criteria,
          state: resolution.state,
          candidates: resolution.candidates,
          located_reference: resolution.located_reference,
          resolution_reason: resolution.resolution_reason,
          last_resolved_at: resolvedAt,
        },
        historyEntry: eventEntry({
          event: "RETRIEVAL_RESOLVED",
          evidenceId,
          at: resolvedAt,
          actor: auth.actor,
          version: nextVersion,
          payloadHash,
          details: { state: resolution.state, resolution_reason: resolution.resolution_reason, candidate_count: resolution.candidates.length },
        }),
      };
    },
  });
}

export async function recordSecretaryRecordsRetrievalHandoff({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_RECORDS_RETRIEVAL_HANDOFF_EVIDENCE_REQUIRED");
  const handedOffAt = iso(payload.handed_off_at || payload.handedOffAt, "handed_off_at");
  const recipientPartyId = text(payload.recipient_party_id || payload.recipientPartyId, 120) || null;
  const channel = text(payload.channel, 120) || null;
  const note = text(payload.note, 2000) || null;
  const payloadHash = sha256(JSON.stringify({ evidenceId, handedOffAt, recipientPartyId, channel, note }));
  return mutateRetrieval({
    context,
    payload,
    at: handedOffAt,
    evidenceId,
    eventName: "REFERENCE_HANDOFF_RECORDED",
    payloadHash,
    producer: async ({ register, auth, nextVersion }) => {
      if (register.state !== "LOCATED" || !register.located_reference) throw new Error("SECRETARY_RECORDS_RETRIEVAL_REFERENCE_NOT_LOCATED");
      if (recipientPartyId) {
        const recipient = await one(
          supabaseAdmin.from("parties").select("id").eq("organization_id", auth.organization).eq("id", recipientPartyId).maybeSingle(),
        );
        if (!recipient) throw new Error("SECRETARY_RECORDS_RETRIEVAL_RECIPIENT_NOT_FOUND");
      }
      const handoff = {
        evidence_id: evidenceId,
        handed_off_at: handedOffAt,
        recipient_party_id: recipientPartyId,
        channel,
        note,
        reference_only: true,
        external_sharing_performed: false,
      };
      return {
        patch: { state: "FULFILLED", fulfilled_at: handedOffAt, handoff },
        historyEntry: eventEntry({
          event: "REFERENCE_HANDOFF_RECORDED",
          evidenceId,
          at: handedOffAt,
          actor: auth.actor,
          version: nextVersion,
          payloadHash,
          details: { recipient_party_id: recipientPartyId, channel, reference_only: true },
        }),
      };
    },
  });
}

export async function cancelSecretaryRecordsRetrieval({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_RECORDS_RETRIEVAL_EVIDENCE_REQUIRED");
  const cancelledAt = iso(payload.cancelled_at || payload.cancelledAt, "cancelled_at");
  const reason = text(payload.reason, 2000);
  if (!reason) throw new Error("SECRETARY_RECORDS_RETRIEVAL_CANCEL_REASON_REQUIRED");
  const payloadHash = sha256(JSON.stringify({ evidenceId, cancelledAt, reason }));
  return mutateRetrieval({
    context,
    payload,
    at: cancelledAt,
    evidenceId,
    eventName: "RETRIEVAL_CANCELLED",
    payloadHash,
    producer: async ({ auth, nextVersion }) => ({
      patch: { state: "CANCELLED", cancelled_at: cancelledAt, cancellation_reason: reason },
      historyEntry: eventEntry({ event: "RETRIEVAL_CANCELLED", evidenceId, at: cancelledAt, actor: auth.actor, version: nextVersion, payloadHash, details: { reason } }),
    }),
  });
}

export async function readSecretaryRecordsRetrieval({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const retrievalId = text(payload.retrieval_id || payload.retrievalId, 120);
  if (!retrievalId) throw new Error("SECRETARY_RECORDS_RETRIEVAL_ID_REQUIRED");
  const task = await readTask({ organization, retrievalId });
  return { status: "completed", contract: CONTRACT, retrieval: task, record: registerFromTask(task), ...safetyFlags() };
}

export async function listSecretaryRecordsRetrievals({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const includeTerminal = payload.include_terminal === true || payload.includeTerminal === true;
  const rawLimit = Number(payload.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeTerminal) query = query.eq("status", "IN_PROGRESS");
  const rows = await many(query);
  return {
    status: "completed",
    contract: CONTRACT,
    count: rows.length,
    retrievals: rows.map((retrieval) => ({ retrieval, record: registerFromTask(retrieval) })),
    ...safetyFlags(),
  };
}

export default Object.freeze({
  request: requestSecretaryRecordsRetrieval,
  resolve: resolveSecretaryRecordsRetrieval,
  recordHandoff: recordSecretaryRecordsRetrievalHandoff,
  cancel: cancelSecretaryRecordsRetrieval,
  read: readSecretaryRecordsRetrieval,
  list: listSecretaryRecordsRetrievals,
});
