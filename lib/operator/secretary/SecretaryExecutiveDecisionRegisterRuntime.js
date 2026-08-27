import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DECISION_REGISTER_V1";
const SOURCE = "secretary_decision_register";
const LEDGER_KEY = "decision_register_v1";

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

function iso(value, field, { required = false } = {}) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_DECISION_REGISTER_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_DECISION_REGISTER_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function rawDecisionValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
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

async function administrativeRouting({ organization, actor, instruction }) {
  const canonicalOwner = await resolveSecretaryCanonicalOwner({ organizationId: organization }) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: canonicalOwner,
    scope: "TASK_ROUTING",
    instruction,
    at: new Date().toISOString(),
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_DECISION_REGISTER_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || canonicalOwner;
  if (actor !== canonicalOwner && actor !== operational) {
    throw new Error("SECRETARY_DECISION_REGISTER_ACTOR_NOT_AUTHORIZED");
  }
  return { canonicalOwner, operational, routing };
}

function emptyLedger(lineageId) {
  return {
    contract: CONTRACT,
    lineage_id: lineageId,
    revision: 0,
    current_version_id: null,
    state: "EMPTY",
    versions: [],
    history: [],
    decision_inferred: false,
    decision_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

function ledgerFromTask(task) {
  const raw = object(object(task.metadata)[LEDGER_KEY]);
  if (raw.contract !== CONTRACT) throw new Error("SECRETARY_DECISION_REGISTER_CONTRACT_INVALID");
  return {
    ...emptyLedger(task.id),
    ...raw,
    versions: list(raw.versions),
    history: list(raw.history),
  };
}

function currentVersion(ledger) {
  const id = text(ledger.current_version_id, 120);
  if (!id) return null;
  return ledger.versions.find((row) => row.version_id === id) || null;
}

function summarizeTask(task) {
  const ledger = ledgerFromTask(task);
  const current = currentVersion(ledger);
  return {
    decision_id: task.id,
    lineage_id: ledger.lineage_id || task.id,
    state: ledger.state,
    current_version: current,
    versions: ledger.versions,
    history: ledger.history,
    source: task.source,
    entity_id: task.entity_id || null,
    canonical_owner_party_id: object(task.metadata).canonical_owner_party_id || task.owner_party_id || null,
    operational_assignee_party_id: object(task.metadata).operational_assignee_party_id || task.owner_party_id || null,
    decision_inferred: false,
    decision_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

async function loadDecisionTask(organization, decisionId) {
  const id = text(decisionId, 120);
  if (!id) throw new Error("SECRETARY_DECISION_REGISTER_DECISION_REQUIRED");
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE || object(task.metadata)[LEDGER_KEY]?.contract !== CONTRACT) {
    throw new Error("SECRETARY_DECISION_REGISTER_DECISION_NOT_FOUND");
  }
  return task;
}

async function validateFollowThroughTask(organization, taskId) {
  const id = text(taskId, 120);
  if (!id) return null;
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("id,title,status,source,metadata")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!task) throw new Error("SECRETARY_DECISION_REGISTER_FOLLOW_THROUGH_TASK_NOT_FOUND");
  if (task.source === SOURCE) throw new Error("SECRETARY_DECISION_REGISTER_FOLLOW_THROUGH_TASK_INVALID");
  return task;
}

function decisionVersion({
  versionId,
  versionNumber,
  decisionText,
  evidenceId,
  sourceReference,
  decidedAt,
  sourceKind,
  sourceMeetingId = null,
  sourceDecisionIndex = null,
  sourceDecisionValue = null,
  decisionOwnerPartyId = null,
  followThroughTaskId = null,
  recordedAt,
  actor,
  canonicalOwner,
}) {
  return {
    version_id: versionId,
    version_number: versionNumber,
    state: "CURRENT",
    decision_text: decisionText,
    decision_text_sha256: sha256(decisionText),
    evidence_id: evidenceId || null,
    source_reference: sourceReference || null,
    decided_at: decidedAt || null,
    source_kind: sourceKind,
    source_meeting_id: sourceMeetingId,
    source_decision_index: sourceDecisionIndex,
    source_decision_value: sourceDecisionValue,
    decision_owner_party_id: decisionOwnerPartyId,
    follow_through_task_id: followThroughTaskId,
    recorded_at: recordedAt,
    recorded_by_party_id: actor,
    canonical_owner_party_id: canonicalOwner,
    decision_timestamp_inferred: false,
    decision_text_inferred: false,
    decision_owner_inferred: false,
    follow_through_inferred: false,
    decision_made_by_secretary: false,
    decision_authority_created: false,
  };
}

async function insertDecisionTask({
  organization,
  entityId,
  decisionId,
  version,
  canonicalOwner,
  operational,
  routing,
  actor,
}) {
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", decisionId)
      .maybeSingle(),
  );
  if (existing) {
    if (existing.source !== SOURCE) throw new Error("SECRETARY_DECISION_REGISTER_ID_COLLISION");
    const ledger = ledgerFromTask(existing);
    const current = currentVersion(ledger);
    if (
      current?.version_id === version.version_id
      && current?.decision_text_sha256 === version.decision_text_sha256
      && text(current?.evidence_id, 500) === text(version.evidence_id, 500)
    ) {
      return { task: existing, replay_safe: true };
    }
    throw new Error("SECRETARY_DECISION_REGISTER_ID_COLLISION");
  }

  const ledger = {
    ...emptyLedger(decisionId),
    revision: 1,
    current_version_id: version.version_id,
    state: "CURRENT",
    versions: [version],
    history: [{
      event: "DECISION_RECORDED",
      revision: 1,
      version_id: version.version_id,
      evidence_id: version.evidence_id,
      source_kind: version.source_kind,
      recorded_at: version.recorded_at,
      recorded_by_party_id: actor,
    }],
  };
  const now = new Date().toISOString();
  const inserted = await supabaseAdmin.from("secretary_tasks").insert({
    id: decisionId,
    organization_id: organization,
    entity_id: entityId || null,
    owner_party_id: canonicalOwner,
    title: text(`Decision: ${version.decision_text}`, 500),
    details: version.decision_text,
    status: "DONE",
    priority: "NORMAL",
    completed_at: now,
    source: SOURCE,
    created_by_party_id: actor,
    metadata: {
      [LEDGER_KEY]: ledger,
      secretary_decision_register: true,
      secretary_decision_register_contract: CONTRACT,
      canonical_owner_party_id: canonicalOwner,
      operational_assignee_party_id: operational,
      ...secretaryAdministrativeCoverageMetadata(routing),
      decision_inferred: false,
      decision_authority_created: false,
      approval_authority_delegated: false,
      binding_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return insertDecisionTask({ organization, entityId, decisionId, version, canonicalOwner, operational, routing, actor });
    }
    throw inserted.error;
  }
  return { task: inserted.data, replay_safe: false };
}

export async function recordSecretaryExecutiveDecision({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const decisionText = text(payload.decision_text || payload.decisionText, 20000);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const decidedAt = iso(payload.decided_at || payload.decidedAt, "decided_at", { required: true });
  if (!decisionText) throw new Error("SECRETARY_DECISION_REGISTER_TEXT_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DECISION_REGISTER_EVIDENCE_REQUIRED");
  const followThrough = await validateFollowThroughTask(organization, payload.follow_through_task_id || payload.followThroughTaskId);
  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Record evidence of an already-made executive decision in the durable decision register.",
  });
  const decisionId = deterministicUuid(`avantiqo-secretary-decision-register-v1:${organization}:direct:${evidenceId}:${decidedAt}:${sha256(decisionText)}`);
  const versionId = deterministicUuid(`${decisionId}:version:1`);
  const recordedAt = new Date().toISOString();
  const version = decisionVersion({
    versionId,
    versionNumber: 1,
    decisionText,
    evidenceId,
    sourceReference: text(payload.source_reference || payload.sourceReference, 2000) || null,
    decidedAt,
    sourceKind: "DIRECT_EVIDENCE",
    decisionOwnerPartyId: text(payload.decision_owner_party_id || payload.decisionOwnerPartyId, 120) || null,
    followThroughTaskId: followThrough?.id || null,
    recordedAt,
    actor,
    canonicalOwner: auth.canonicalOwner,
  });
  const created = await insertDecisionTask({
    organization,
    entityId: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    decisionId,
    version,
    canonicalOwner: auth.canonicalOwner,
    operational: auth.operational,
    routing: auth.routing,
    actor,
  });
  return {
    status: "recorded",
    contract: CONTRACT,
    decision: summarizeTask(created.task),
    replay_safe: created.replay_safe,
    evidence_required: true,
    decision_timestamp_inferred: false,
    decision_inferred: false,
    decision_made_by_secretary: false,
    decision_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export async function syncSecretaryMeetingDecisions({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const meetingId = text(payload.meeting_id || payload.meetingId, 120);
  if (!meetingId) throw new Error("SECRETARY_DECISION_REGISTER_MEETING_REQUIRED");
  const meeting = await one(
    supabaseAdmin.from("secretary_meetings")
      .select("id,entity_id,title,status,ended_at,processed_at,decisions")
      .eq("organization_id", organization)
      .eq("id", meetingId)
      .maybeSingle(),
  );
  if (!meeting) throw new Error("SECRETARY_DECISION_REGISTER_MEETING_NOT_FOUND");
  if (meeting.status !== "COMPLETED") throw new Error("SECRETARY_DECISION_REGISTER_MEETING_NOT_COMPLETED");
  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Copy already-recorded finalized meeting decisions into the durable executive decision register without inferring new decisions.",
  });
  const outputs = [];
  const decisions = list(meeting.decisions);
  for (let index = 0; index < decisions.length; index += 1) {
    const rawValue = rawDecisionValue(decisions[index]);
    const decisionText = text(rawValue, 20000);
    if (!decisionText) continue;
    const sourceRef = `secretary_meeting:${meeting.id}:decision:${index}`;
    const decisionId = deterministicUuid(`avantiqo-secretary-decision-register-v1:${organization}:meeting:${meeting.id}:${index}:${sha256(rawValue)}`);
    const versionId = deterministicUuid(`${decisionId}:version:1`);
    const recordedAt = new Date().toISOString();
    const version = decisionVersion({
      versionId,
      versionNumber: 1,
      decisionText,
      evidenceId: sourceRef,
      sourceReference: sourceRef,
      decidedAt: null,
      sourceKind: "FINALIZED_MEETING_DECISION_RECORD",
      sourceMeetingId: meeting.id,
      sourceDecisionIndex: index,
      sourceDecisionValue: decisions[index],
      decisionOwnerPartyId: null,
      followThroughTaskId: null,
      recordedAt,
      actor,
      canonicalOwner: auth.canonicalOwner,
    });
    const created = await insertDecisionTask({
      organization,
      entityId: meeting.entity_id || null,
      decisionId,
      version,
      canonicalOwner: auth.canonicalOwner,
      operational: auth.operational,
      routing: auth.routing,
      actor,
    });
    outputs.push({ decision: summarizeTask(created.task), replay_safe: created.replay_safe });
  }
  return {
    status: "completed",
    contract: CONTRACT,
    meeting_id: meeting.id,
    source_meeting_ended_at: meeting.ended_at || null,
    source_meeting_processed_at: meeting.processed_at || null,
    recorded_decision_count: outputs.length,
    decisions: outputs,
    meeting_decision_record_used_as_evidence: true,
    decision_timestamp_inferred: false,
    decision_inferred: false,
    decision_made_by_secretary: false,
    decision_authority_created: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

async function mutateDecision({ context, decisionId, instruction, producer }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const auth = await administrativeRouting({ organization, actor, instruction });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await loadDecisionTask(organization, decisionId);
    const ledger = ledgerFromTask(task);
    const produced = await producer({ task, ledger, actor, auth });
    if (produced.replay_safe === true) {
      return { task, ledger, output: object(produced.output), replay_safe: true };
    }
    const metadata = {
      ...object(task.metadata),
      [LEDGER_KEY]: produced.ledger,
      secretary_decision_register: true,
      secretary_decision_register_contract: CONTRACT,
      canonical_owner_party_id: auth.canonicalOwner,
      operational_assignee_party_id: auth.operational,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      decision_inferred: false,
      decision_authority_created: false,
      approval_authority_delegated: false,
      binding_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
    const patch = {
      ...object(produced.task_patch),
      metadata,
      updated_at: new Date().toISOString(),
    };
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update(patch)
      .eq("organization_id", organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return { task: updated.data, ledger: produced.ledger, output: object(produced.output), replay_safe: false };
  }
  throw new Error("SECRETARY_DECISION_REGISTER_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function supersedeSecretaryExecutiveDecision({ context, payload = {} } = {}) {
  const decisionId = payload.decision_id || payload.decisionId;
  const supersedesVersionId = text(payload.supersedes_version_id || payload.supersedesVersionId, 120);
  const replacementText = text(payload.replacement_decision_text || payload.replacementDecisionText, 20000);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const decidedAt = iso(payload.decided_at || payload.decidedAt, "decided_at", { required: true });
  if (!supersedesVersionId) throw new Error("SECRETARY_DECISION_REGISTER_SUPERSEDES_VERSION_REQUIRED");
  if (!replacementText) throw new Error("SECRETARY_DECISION_REGISTER_REPLACEMENT_TEXT_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DECISION_REGISTER_EVIDENCE_REQUIRED");
  const organization = organizationId(context);
  const followThrough = await validateFollowThroughTask(organization, payload.follow_through_task_id || payload.followThroughTaskId);
  const result = await mutateDecision({
    context,
    decisionId,
    instruction: "Record explicit evidence that an existing executive decision was superseded by another already-made decision.",
    producer: async ({ ledger, actor, auth }) => {
      const current = currentVersion(ledger);
      const newVersionNumber = Number(ledger.revision || 0) + 1;
      const newVersionId = deterministicUuid(`${ledger.lineage_id}:version:${newVersionNumber}:${evidenceId}:${decidedAt}:${sha256(replacementText)}`);
      if (ledger.current_version_id === newVersionId) {
        return { replay_safe: true, output: { version: current } };
      }
      if (!current || current.version_id !== supersedesVersionId || ledger.state !== "CURRENT") {
        throw new Error("SECRETARY_DECISION_REGISTER_STALE_SUPERSESSION_REJECTED");
      }
      const now = new Date().toISOString();
      const nextVersions = ledger.versions.map((row) => row.version_id === supersedesVersionId
        ? { ...row, state: "SUPERSEDED", superseded_at: decidedAt, superseded_by_version_id: newVersionId, supersession_evidence_id: evidenceId }
        : row);
      const replacement = decisionVersion({
        versionId: newVersionId,
        versionNumber: newVersionNumber,
        decisionText: replacementText,
        evidenceId,
        sourceReference: text(payload.source_reference || payload.sourceReference, 2000) || null,
        decidedAt,
        sourceKind: "EXPLICIT_SUPERSESSION_EVIDENCE",
        decisionOwnerPartyId: text(payload.decision_owner_party_id || payload.decisionOwnerPartyId, 120) || null,
        followThroughTaskId: followThrough?.id || null,
        recordedAt: now,
        actor,
        canonicalOwner: auth.canonicalOwner,
      });
      nextVersions.push(replacement);
      return {
        ledger: {
          ...ledger,
          revision: newVersionNumber,
          current_version_id: newVersionId,
          state: "CURRENT",
          versions: nextVersions.slice(-200),
          history: [...ledger.history, {
            event: "DECISION_SUPERSEDED",
            revision: newVersionNumber,
            supersedes_version_id: supersedesVersionId,
            version_id: newVersionId,
            evidence_id: evidenceId,
            decided_at: decidedAt,
            recorded_at: now,
            recorded_by_party_id: actor,
          }].slice(-500),
        },
        task_patch: {
          title: text(`Decision: ${replacementText}`, 500),
          details: replacementText,
        },
        output: { version: replacement },
      };
    },
  });
  return {
    status: "superseded",
    contract: CONTRACT,
    decision: summarizeTask(result.task),
    replay_safe: result.replay_safe,
    stale_supersession_fenced: true,
    decision_inferred: false,
    decision_made_by_secretary: false,
    decision_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export async function retractSecretaryExecutiveDecision({ context, payload = {} } = {}) {
  const decisionId = payload.decision_id || payload.decisionId;
  const retractsVersionId = text(payload.retracts_version_id || payload.retractsVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const retractedAt = iso(payload.retracted_at || payload.retractedAt, "retracted_at", { required: true });
  if (!retractsVersionId) throw new Error("SECRETARY_DECISION_REGISTER_RETRACTS_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DECISION_REGISTER_EVIDENCE_REQUIRED");
  const result = await mutateDecision({
    context,
    decisionId,
    instruction: "Record explicit evidence that an existing executive decision was withdrawn or retracted. Do not create a replacement decision.",
    producer: async ({ ledger, actor }) => {
      const current = currentVersion(ledger);
      const replay = ledger.state === "RETRACTED"
        && ledger.current_version_id === null
        && ledger.history.some((row) => row.event === "DECISION_RETRACTED" && row.retracts_version_id === retractsVersionId && row.evidence_id === evidenceId && row.retracted_at === retractedAt);
      if (replay) return { replay_safe: true };
      if (!current || current.version_id !== retractsVersionId || ledger.state !== "CURRENT") {
        throw new Error("SECRETARY_DECISION_REGISTER_STALE_RETRACTION_REJECTED");
      }
      const revision = Number(ledger.revision || 0) + 1;
      const now = new Date().toISOString();
      const versions = ledger.versions.map((row) => row.version_id === retractsVersionId
        ? { ...row, state: "RETRACTED", retracted_at: retractedAt, retraction_evidence_id: evidenceId }
        : row);
      return {
        ledger: {
          ...ledger,
          revision,
          current_version_id: null,
          state: "RETRACTED",
          versions,
          history: [...ledger.history, {
            event: "DECISION_RETRACTED",
            revision,
            retracts_version_id: retractsVersionId,
            evidence_id: evidenceId,
            source_reference: text(payload.source_reference || payload.sourceReference, 2000) || null,
            reason: text(payload.reason, 3000) || null,
            retracted_at: retractedAt,
            recorded_at: now,
            recorded_by_party_id: actor,
          }].slice(-500),
        },
        task_patch: {},
      };
    },
  });
  return {
    status: "retracted",
    contract: CONTRACT,
    decision: summarizeTask(result.task),
    replay_safe: result.replay_safe,
    stale_retraction_fenced: true,
    decision_inferred: false,
    decision_made_by_secretary: false,
    decision_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export async function linkSecretaryDecisionFollowThrough({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const decisionId = payload.decision_id || payload.decisionId;
  const currentVersionId = text(payload.current_version_id || payload.currentVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!currentVersionId) throw new Error("SECRETARY_DECISION_REGISTER_CURRENT_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DECISION_REGISTER_EVIDENCE_REQUIRED");
  const followThrough = await validateFollowThroughTask(organization, payload.follow_through_task_id || payload.followThroughTaskId);
  if (!followThrough) throw new Error("SECRETARY_DECISION_REGISTER_FOLLOW_THROUGH_TASK_REQUIRED");
  const result = await mutateDecision({
    context,
    decisionId,
    instruction: "Link an explicit existing follow-through task to a recorded executive decision without changing the decision itself.",
    producer: async ({ ledger, actor }) => {
      const current = currentVersion(ledger);
      if (!current || current.version_id !== currentVersionId || ledger.state !== "CURRENT") {
        throw new Error("SECRETARY_DECISION_REGISTER_STALE_FOLLOW_THROUGH_LINK_REJECTED");
      }
      if (current.follow_through_task_id === followThrough.id) {
        return { replay_safe: true };
      }
      const revision = Number(ledger.revision || 0) + 1;
      const now = new Date().toISOString();
      const versions = ledger.versions.map((row) => row.version_id === currentVersionId
        ? { ...row, follow_through_task_id: followThrough.id, follow_through_inferred: false, follow_through_evidence_id: evidenceId }
        : row);
      return {
        ledger: {
          ...ledger,
          revision,
          versions,
          history: [...ledger.history, {
            event: "FOLLOW_THROUGH_LINKED",
            revision,
            version_id: currentVersionId,
            follow_through_task_id: followThrough.id,
            evidence_id: evidenceId,
            recorded_at: now,
            recorded_by_party_id: actor,
          }].slice(-500),
        },
        task_patch: {},
      };
    },
  });
  return {
    status: "linked",
    contract: CONTRACT,
    decision: summarizeTask(result.task),
    replay_safe: result.replay_safe,
    follow_through_inferred: false,
    decision_inferred: false,
    decision_authority_created: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export async function readSecretaryExecutiveDecision({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadDecisionTask(organization, payload.decision_id || payload.decisionId);
  return {
    status: "completed",
    contract: CONTRACT,
    decision: summarizeTask(task),
    evidence_only: true,
    decision_inferred: false,
    decision_authority_created: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export async function listSecretaryExecutiveDecisions({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const limit = Math.min(500, Math.max(1, Number(payload.limit || 200)));
  const tasks = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", SOURCE)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  const decisions = tasks.map(summarizeTask);
  return {
    status: "completed",
    contract: CONTRACT,
    decisions,
    current_decisions: decisions.filter((item) => item.state === "CURRENT"),
    retracted_decisions: decisions.filter((item) => item.state === "RETRACTED"),
    summary: {
      returned_lineages: decisions.length,
      current_lineages: decisions.filter((item) => item.state === "CURRENT").length,
      retracted_lineages: decisions.filter((item) => item.state === "RETRACTED").length,
      version_count: decisions.reduce((sum, item) => sum + item.versions.length, 0),
    },
    evidence_only: true,
    durable_records_only: true,
    decision_timestamp_inferred: false,
    decision_inferred: false,
    decision_made_by_secretary: false,
    decision_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  record: recordSecretaryExecutiveDecision,
  syncMeeting: syncSecretaryMeetingDecisions,
  supersede: supersedeSecretaryExecutiveDecision,
  retract: retractSecretaryExecutiveDecision,
  linkFollowThrough: linkSecretaryDecisionFollowThrough,
  read: readSecretaryExecutiveDecision,
  list: listSecretaryExecutiveDecisions,
});
