import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_WRITTEN_ACTION_ADMINISTRATION_V1";
const SOURCE = "secretary_written_action_administration";
const REGISTER_KEY = "written_action_administration_v1";
const ACTION_KINDS = new Set(["WRITTEN_RESOLUTION", "WRITTEN_CONSENT", "CIRCULAR_ACTION", "OTHER"]);
const EXPECTED_RESPONSE_KINDS = new Set(["APPROVAL", "CONSENT", "ACKNOWLEDGEMENT"]);
const RESPONSE_VALUES = Object.freeze({
  APPROVAL: new Set(["APPROVED", "DECLINED", "ABSTAINED"]),
  CONSENT: new Set(["CONSENTED", "DECLINED", "ABSTAINED"]),
  ACKNOWLEDGEMENT: new Set(["ACKNOWLEDGED"]),
});
const OUTCOMES = new Set(["REPORTED_EFFECTIVE", "REPORTED_NOT_EFFECTIVE", "WITHDRAWN"]);
const ACTIVE_STATES = new Set(["CIRCULATING", "RESPONSES_COMPLETE", "OUTCOME_RECORDED"]);

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function many(result) { const resolved = await result; if (resolved.error) throw resolved.error; return Array.isArray(resolved.data) ? resolved.data : []; }

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
    if (required) throw new Error(`SECRETARY_WRITTEN_ACTION_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_WRITTEN_ACTION_${field.toUpperCase()}_INVALID`);
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
    quorum_determined: false,
    legal_validity_inferred: false,
    legal_effect_inferred: false,
    statutory_compliance_inferred: false,
    corporate_authority_created: false,
    vote_cast_by_secretary: false,
    consent_given_by_secretary: false,
    signature_created_by_secretary: false,
    signature_validity_inferred: false,
    participant_response_inferred: false,
    outcome_inferred: false,
    filing_performed_by_runtime: false,
    external_message_sent_by_runtime: false,
    document_store_created: false,
    file_content_read: false,
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
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_WRITTEN_ACTION_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_WRITTEN_ACTION_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function ensureParty(organization, partyId, field = "participant") {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_WRITTEN_ACTION_${field.toUpperCase()}_PARTY_REQUIRED`);
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party || party.status !== "ACTIVE") throw new Error(`SECRETARY_WRITTEN_ACTION_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return party;
}

async function resolveFiledDocument(organization, filingIdValue, versionValue, fieldPrefix = "source") {
  const filingId = text(filingIdValue, 120);
  if (!filingId) throw new Error(`SECRETARY_WRITTEN_ACTION_${fieldPrefix.toUpperCase()}_DOCUMENT_FILING_REQUIRED`);
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("id,source,status,metadata")
      .eq("organization_id", organization)
      .eq("id", filingId)
      .eq("source", "secretary_document_filing")
      .maybeSingle(),
  );
  if (!task) throw new Error(`SECRETARY_WRITTEN_ACTION_${fieldPrefix.toUpperCase()}_DOCUMENT_FILING_NOT_FOUND`);
  const metadata = object(task.metadata);
  if (metadata.document_status === "CANCELLED") throw new Error(`SECRETARY_WRITTEN_ACTION_${fieldPrefix.toUpperCase()}_DOCUMENT_CANCELLED`);
  const requestedVersion = Number(versionValue);
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1) {
    throw new Error(`SECRETARY_WRITTEN_ACTION_${fieldPrefix.toUpperCase()}_DOCUMENT_VERSION_REQUIRED`);
  }
  const version = list(metadata.versions).find((row) => Number(row.version) === requestedVersion);
  if (!version || !text(version.source_reference, 1800)) {
    throw new Error(`SECRETARY_WRITTEN_ACTION_${fieldPrefix.toUpperCase()}_DOCUMENT_VERSION_NOT_FOUND`);
  }
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

async function normalizeParticipants(organization, participants, defaultDueAt) {
  const input = list(participants).slice(0, 100);
  if (!input.length) throw new Error("SECRETARY_WRITTEN_ACTION_PARTICIPANT_REQUIRED");
  const rows = [];
  const seen = new Set();
  for (let index = 0; index < input.length; index += 1) {
    const row = object(input[index]);
    const party = await ensureParty(organization, row.party_id || row.partyId, "participant");
    if (seen.has(party.id)) throw new Error("SECRETARY_WRITTEN_ACTION_PARTICIPANT_DUPLICATE");
    seen.add(party.id);
    const expectedResponse = text(row.expected_response || row.expectedResponse, 60).toUpperCase();
    if (!EXPECTED_RESPONSE_KINDS.has(expectedResponse)) {
      throw new Error(`SECRETARY_WRITTEN_ACTION_EXPECTED_RESPONSE_INVALID:${index}`);
    }
    rows.push({
      party_id: party.id,
      expected_response: expectedResponse,
      response_due_at: iso(row.response_due_at || row.responseDueAt || defaultDueAt, "response_due_at"),
      response_status: "PENDING",
      response_value: null,
      responded_at: null,
      response_evidence_id: null,
      response_source_reference: null,
    });
  }
  return rows;
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_WRITTEN_ACTION_RECORD_INVALID");
  return {
    ...register,
    participants: list(register.participants),
    frozen_versions: list(register.frozen_versions),
    history: list(register.history),
  };
}
async function readTask(organization, actionId) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", actionId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_WRITTEN_ACTION_NOT_FOUND");
  return task;
}
function frozenSnapshot(register, evidenceId, occurredAt) {
  return {
    action_version: register.action_version,
    title: register.title,
    action_kind: register.action_kind,
    source_document: register.source_document,
    participants: register.participants.map((row) => ({
      party_id: row.party_id,
      expected_response: row.expected_response,
      response_due_at: row.response_due_at,
    })),
    frozen_at: occurredAt,
    evidence_id: evidenceId,
    content_sha256: sha256({
      title: register.title,
      action_kind: register.action_kind,
      source_document: register.source_document,
      participants: register.participants.map((row) => ({
        party_id: row.party_id,
        expected_response: row.expected_response,
        response_due_at: row.response_due_at,
      })),
    }),
  };
}
function response(task, register, extra = {}) {
  return { status: "completed", contract: CONTRACT, written_action: task, record: register, ...extra, ...safetyFlags() };
}
function followUpId(actionId, actionVersion, participantPartyId) {
  return deterministicUuid(`avantiqo-secretary-written-action-follow-up-v1:${actionId}:${actionVersion}:participant:${participantPartyId}`);
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

async function ensureResponseFollowUp({ task, register, participant, actor, routing }) {
  const id = followUpId(task.id, register.action_version, participant.party_id);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const actionType = await preferredActionType(task.organization_id, participant.party_id);
  const instruction = [
    `Request the recorded ${participant.expected_response.toLowerCase()} response for written action v${register.action_version} \"${register.title}\".`,
    `Recorded response due: ${participant.response_due_at}.`,
    "Capture only the participant's explicit response and evidence source. Do not vote, approve, consent, sign, determine quorum, infer silence as a response, or determine legal validity/effect on the participant's behalf.",
  ].join(" ");
  return one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      id,
      organization_id: task.organization_id,
      entity_id: task.entity_id || null,
      owner_party_id: task.owner_party_id,
      contact_party_id: participant.party_id,
      task_id: task.id,
      action_type: actionType,
      reason: instruction,
      status: "PENDING",
      due_at: participant.response_due_at,
      created_by_party_id: actor,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: actionType !== "REVIEW",
        execution_instruction: instruction,
        secretary_owned: true,
        secretary_written_action_administration: true,
        secretary_written_action_contract: CONTRACT,
        secretary_written_action_id: task.id,
        secretary_written_action_version: register.action_version,
        secretary_written_action_participant_party_id: participant.party_id,
        expected_response: participant.expected_response,
        participant_response_inferred: false,
        quorum_determined: false,
        legal_validity_inferred: false,
        legal_effect_inferred: false,
        ...secretaryAdministrativeCoverageMetadata(routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
}

async function cancelFollowUps(task, { participantPartyId = null, reason = "Written-action follow-up superseded." } = {}) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_written_action_contract !== CONTRACT) return false;
    if (participantPartyId && text(metadata.secretary_written_action_participant_party_id, 120) !== text(participantPartyId, 120)) return false;
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

function replayOrConflict(register, evidenceId, eventName, payloadHash) {
  const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
  if (!replay) return null;
  if (replay.event !== eventName || replay.payload_sha256 !== payloadHash) {
    throw new Error("SECRETARY_WRITTEN_ACTION_EVIDENCE_REUSE_CONFLICT");
  }
  return replay;
}

async function mutate({ context, payload = {}, eventName, instruction, allowedStates = ACTIVE_STATES, producer }) {
  const actionId = text(payload.action_id || payload.actionId, 120);
  if (!actionId) throw new Error("SECRETARY_WRITTEN_ACTION_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_WRITTEN_ACTION_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_WRITTEN_ACTION_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = sha256(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, actionId);
    const register = registerFromTask(task);
    const replay = replayOrConflict(register, evidenceId, eventName, hash);
    if (replay) return response(task, register, { replay_safe: true });
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_WRITTEN_ACTION_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_WRITTEN_ACTION_STALE_VERSION");
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
    const terminal = next.state === "FILED" || next.state === "CANCELLED";
    const nextDueAt = terminal
      ? null
      : next.participants.filter((row) => row.response_status === "PENDING").map((row) => row.response_due_at).filter(Boolean).sort()[0] || null;
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: next.state === "FILED" ? "DONE" : next.state === "CANCELLED" ? "CANCELLED" : "IN_PROGRESS",
        completed_at: terminal ? occurredAt : null,
        due_at: nextDueAt,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_written_action_contract: CONTRACT,
          secretary_written_action_state: next.state,
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
    if (produced.cancelParticipantFollowUp) {
      await cancelFollowUps(updated.data, {
        participantPartyId: produced.cancelParticipantFollowUp,
        reason: produced.cancelReason || "Explicit participant response evidence recorded.",
      });
    }
    return response(updated.data, next, { replay_safe: false });
  }
  throw new Error("SECRETARY_WRITTEN_ACTION_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryWrittenActionAdministration({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_WRITTEN_ACTION_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const auth = await routingFor({
    context,
    instruction: "Administratively circulate a frozen written-action source document and collect explicit participant responses without exercising corporate or legal authority",
    at: occurredAt,
  });
  const title = text(payload.title, 1000);
  if (!title) throw new Error("SECRETARY_WRITTEN_ACTION_TITLE_REQUIRED");
  const actionKind = text(payload.action_kind || payload.actionKind, 60).toUpperCase();
  if (!ACTION_KINDS.has(actionKind)) throw new Error("SECRETARY_WRITTEN_ACTION_KIND_INVALID");
  const defaultDueAt = iso(payload.response_due_at || payload.responseDueAt, "response_due_at");
  const sourceDocument = await resolveFiledDocument(
    auth.organization,
    payload.source_document_filing_id || payload.sourceDocumentFilingId,
    payload.source_document_version ?? payload.sourceDocumentVersion,
    "source",
  );
  const participants = await normalizeParticipants(auth.organization, payload.participants, defaultDueAt);
  const actionId = deterministicUuid(`avantiqo-secretary-written-action-v1:${auth.organization}:${evidenceId}`);
  const hash = sha256(payload);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", auth.organization).eq("id", actionId).maybeSingle(),
  );
  if (existing) {
    const register = registerFromTask(existing);
    const replay = replayOrConflict(register, evidenceId, "STARTED", hash);
    if (!replay) throw new Error("SECRETARY_WRITTEN_ACTION_EVIDENCE_REUSE_CONFLICT");
    return response(existing, register, { replay_safe: true });
  }
  const base = {
    contract: CONTRACT,
    action_id: actionId,
    title,
    action_kind: actionKind,
    state: "CIRCULATING",
    version: 1,
    action_version: 1,
    source_document: sourceDocument,
    participants,
    reported_outcome: null,
    outcome_source_reference: null,
    outcome_reported_by_party_id: null,
    outcome_recorded_at: null,
    final_filing: null,
    frozen_versions: [],
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    history: [],
    ...safetyFlags(),
  };
  base.frozen_versions = [frozenSnapshot(base, evidenceId, occurredAt)];
  base.history = [{
    event: "STARTED",
    evidence_id: evidenceId,
    occurred_at: occurredAt,
    recorded_by_party_id: auth.actor,
    payload_sha256: hash,
    action_version: 1,
    source_document_filing_id: sourceDocument.document_filing_id,
    source_document_version: sourceDocument.version,
    ...safetyFlags(),
  }];
  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: actionId,
      organization_id: auth.organization,
      owner_party_id: auth.operational,
      title: `Written action: ${title}`,
      details: "Administrative circulation and evidence register only. No quorum, legal validity/effect, vote, consent, signature, filing, or corporate authority is created by this runtime.",
      status: "IN_PROGRESS",
      priority: "NORMAL",
      due_at: participants.map((row) => row.response_due_at).sort()[0] || null,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: base,
        secretary_written_action_contract: CONTRACT,
        secretary_written_action_state: base.state,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
  return response(task, base, { replay_safe: false });
}

export async function reviseSecretaryWrittenActionAdministration({ context, payload = {} } = {}) {
  return mutate({
    context,
    payload,
    eventName: "REVISED",
    instruction: "Replace the frozen written-action circulation package from explicit source-document and participant inputs; do not infer legal consequences of the revision",
    allowedStates: new Set(["CIRCULATING", "RESPONSES_COMPLETE"]),
    producer: async ({ register, auth, occurredAt, evidenceId }) => {
      const title = text(payload.title, 1000);
      if (!title) throw new Error("SECRETARY_WRITTEN_ACTION_TITLE_REQUIRED");
      const actionKind = text(payload.action_kind || payload.actionKind, 60).toUpperCase();
      if (!ACTION_KINDS.has(actionKind)) throw new Error("SECRETARY_WRITTEN_ACTION_KIND_INVALID");
      const defaultDueAt = iso(payload.response_due_at || payload.responseDueAt, "response_due_at");
      const sourceDocument = await resolveFiledDocument(
        auth.organization,
        payload.source_document_filing_id || payload.sourceDocumentFilingId,
        payload.source_document_version ?? payload.sourceDocumentVersion,
        "source",
      );
      const participants = await normalizeParticipants(auth.organization, payload.participants, defaultDueAt);
      const nextContent = {
        ...register,
        title,
        action_kind: actionKind,
        source_document: sourceDocument,
        participants,
        action_version: Number(register.action_version) + 1,
      };
      return {
        patch: {
          state: "CIRCULATING",
          title,
          action_kind: actionKind,
          source_document: sourceDocument,
          participants,
          action_version: nextContent.action_version,
          reported_outcome: null,
          outcome_source_reference: null,
          outcome_reported_by_party_id: null,
          outcome_recorded_at: null,
          final_filing: null,
          frozen_versions: [...register.frozen_versions, frozenSnapshot(nextContent, evidenceId, occurredAt)].slice(-100),
        },
        cancelAllFollowUps: true,
        cancelReason: "Superseded by a new frozen written-action version.",
        historyDetails: {
          action_version: nextContent.action_version,
          source_document_filing_id: sourceDocument.document_filing_id,
          source_document_version: sourceDocument.version,
        },
      };
    },
  });
}

export async function refreshSecretaryWrittenActionAdministration({ context, payload = {} } = {}) {
  const actionId = text(payload.action_id || payload.actionId, 120);
  if (!actionId) throw new Error("SECRETARY_WRITTEN_ACTION_ID_REQUIRED");
  const auth = await routingFor({
    context,
    instruction: "Refresh administrative response follow-through for the written action without inferring participant responses, quorum, validity, or legal effect",
    at: new Date().toISOString(),
  });
  const task = await readTask(auth.organization, actionId);
  const register = registerFromTask(task);
  if (!["CIRCULATING", "RESPONSES_COMPLETE"].includes(register.state)) {
    throw new Error(`SECRETARY_WRITTEN_ACTION_STATE_INVALID:${register.state}`);
  }
  const rows = [];
  for (const participant of register.participants) {
    if (participant.response_status !== "PENDING") continue;
    rows.push(await ensureResponseFollowUp({ task, register, participant, actor: auth.actor, routing: auth.routing }));
  }
  return response(task, register, {
    follow_up_count: rows.length,
    follow_up_ids: rows.map((row) => row.id),
  });
}

export async function recordSecretaryWrittenActionResponse({ context, payload = {} } = {}) {
  const participantPartyId = text(payload.participant_party_id || payload.participantPartyId, 120);
  const responseValue = text(payload.response_value || payload.responseValue, 60).toUpperCase();
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1800);
  if (!participantPartyId) throw new Error("SECRETARY_WRITTEN_ACTION_PARTICIPANT_PARTY_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_WRITTEN_ACTION_RESPONSE_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "PARTICIPANT_RESPONSE_RECORDED",
    instruction: "Record only explicit participant response evidence for a written action; do not vote, consent, approve, sign, determine quorum, or infer legal effect for the participant",
    allowedStates: new Set(["CIRCULATING", "RESPONSES_COMPLETE"]),
    producer: async ({ register, occurredAt, evidenceId }) => {
      const index = register.participants.findIndex((row) => row.party_id === participantPartyId);
      if (index < 0) throw new Error("SECRETARY_WRITTEN_ACTION_PARTICIPANT_NOT_FOUND");
      const participant = register.participants[index];
      if (!RESPONSE_VALUES[participant.expected_response]?.has(responseValue)) {
        throw new Error("SECRETARY_WRITTEN_ACTION_RESPONSE_VALUE_INVALID");
      }
      const participants = register.participants.map((row, participantIndex) => participantIndex === index ? {
        ...row,
        response_status: "RECORDED",
        response_value: responseValue,
        responded_at: occurredAt,
        response_evidence_id: evidenceId,
        response_source_reference: sourceReference,
      } : row);
      const allRecorded = participants.every((row) => row.response_status === "RECORDED");
      return {
        patch: {
          participants,
          state: allRecorded ? "RESPONSES_COMPLETE" : "CIRCULATING",
        },
        cancelParticipantFollowUp: participantPartyId,
        cancelReason: "Explicit participant response evidence recorded.",
        historyDetails: {
          participant_party_id: participantPartyId,
          expected_response: participant.expected_response,
          response_value: responseValue,
          source_reference: sourceReference,
          action_version: register.action_version,
        },
      };
    },
  });
}

export async function recordSecretaryWrittenActionOutcome({ context, payload = {} } = {}) {
  const outcome = text(payload.reported_outcome || payload.reportedOutcome, 80).toUpperCase();
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1800);
  const reportedByPartyId = text(payload.reported_by_party_id || payload.reportedByPartyId, 120);
  if (!OUTCOMES.has(outcome)) throw new Error("SECRETARY_WRITTEN_ACTION_OUTCOME_INVALID");
  if (!sourceReference) throw new Error("SECRETARY_WRITTEN_ACTION_OUTCOME_SOURCE_REQUIRED");
  if (!reportedByPartyId) throw new Error("SECRETARY_WRITTEN_ACTION_OUTCOME_REPORTER_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "OUTCOME_RECORDED",
    instruction: "Record an explicitly reported written-action outcome as administrative evidence only; do not determine quorum, legal validity/effect, statutory compliance, or corporate authority",
    allowedStates: new Set(["CIRCULATING", "RESPONSES_COMPLETE"]),
    producer: async ({ register, auth, occurredAt }) => {
      await ensureParty(auth.organization, reportedByPartyId, "outcome_reporter");
      if (outcome !== "WITHDRAWN" && register.participants.some((row) => row.response_status !== "RECORDED")) {
        throw new Error("SECRETARY_WRITTEN_ACTION_RESPONSES_INCOMPLETE");
      }
      return {
        patch: {
          state: "OUTCOME_RECORDED",
          reported_outcome: outcome,
          outcome_source_reference: sourceReference,
          outcome_reported_by_party_id: reportedByPartyId,
          outcome_recorded_at: occurredAt,
        },
        cancelAllFollowUps: true,
        cancelReason: "Explicit written-action outcome evidence recorded.",
        historyDetails: {
          reported_outcome: outcome,
          source_reference: sourceReference,
          reported_by_party_id: reportedByPartyId,
          action_version: register.action_version,
        },
      };
    },
  });
}

export async function recordSecretaryWrittenActionFiling({ context, payload = {} } = {}) {
  const filingSourceReference = text(payload.filing_source_reference || payload.filingSourceReference, 1800);
  if (!filingSourceReference) throw new Error("SECRETARY_WRITTEN_ACTION_FILING_SOURCE_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "FINAL_FILING_RECORDED",
    instruction: "Record explicit evidence of a final written-action filing performed through an existing document-filing path; this runtime does not file or establish legal effect",
    allowedStates: new Set(["OUTCOME_RECORDED"]),
    producer: async ({ register, auth, occurredAt, evidenceId }) => {
      const finalDocument = await resolveFiledDocument(
        auth.organization,
        payload.final_document_filing_id || payload.finalDocumentFilingId,
        payload.final_document_version ?? payload.finalDocumentVersion,
        "final",
      );
      return {
        patch: {
          state: "FILED",
          final_filing: {
            document: finalDocument,
            filing_source_reference: filingSourceReference,
            evidence_id: evidenceId,
            recorded_at: occurredAt,
          },
        },
        cancelAllFollowUps: true,
        cancelReason: "Final written-action filing evidence recorded.",
        historyDetails: {
          final_document_filing_id: finalDocument.document_filing_id,
          final_document_version: finalDocument.version,
          filing_source_reference: filingSourceReference,
          action_version: register.action_version,
        },
      };
    },
  });
}

export async function cancelSecretaryWrittenActionAdministration({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1200);
  if (!reason) throw new Error("SECRETARY_WRITTEN_ACTION_CANCEL_REASON_REQUIRED");
  return mutate({
    context,
    payload,
    eventName: "TRACKING_CANCELLED",
    instruction: "Cancel only Secretary written-action administrative tracking; do not withdraw a corporate action, delete documents, revoke signatures, or alter legal status",
    allowedStates: ACTIVE_STATES,
    producer: async () => ({
      patch: { state: "CANCELLED" },
      cancelAllFollowUps: true,
      cancelReason: "Written-action administrative tracking cancelled.",
      historyDetails: { reason },
    }),
  });
}

export async function readSecretaryWrittenActionAdministration({ context, payload = {} } = {}) {
  const actionId = text(payload.action_id || payload.actionId, 120);
  if (!actionId) throw new Error("SECRETARY_WRITTEN_ACTION_ID_REQUIRED");
  const task = await readTask(organizationId(context), actionId);
  return response(task, registerFromTask(task));
}

export async function listSecretaryWrittenActionAdministration({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const limit = Math.max(1, Math.min(200, Number(payload.limit) || 50));
  const rows = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", SOURCE)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return {
    status: "completed",
    contract: CONTRACT,
    items: rows.map((task) => ({ task, record: registerFromTask(task) })),
    ...safetyFlags(),
  };
}

export default Object.freeze({
  start: startSecretaryWrittenActionAdministration,
  revise: reviseSecretaryWrittenActionAdministration,
  refresh: refreshSecretaryWrittenActionAdministration,
  recordResponse: recordSecretaryWrittenActionResponse,
  recordOutcome: recordSecretaryWrittenActionOutcome,
  recordFiling: recordSecretaryWrittenActionFiling,
  cancel: cancelSecretaryWrittenActionAdministration,
  read: readSecretaryWrittenActionAdministration,
  list: listSecretaryWrittenActionAdministration,
});
