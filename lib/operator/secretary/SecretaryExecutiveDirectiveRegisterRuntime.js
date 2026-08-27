import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DIRECTIVE_REGISTER_V1";
const SOURCE = "secretary_directive_register";
const LEDGER_KEY = "directive_register_v1";
const MAX_INSTRUCTION_LENGTH = 50000;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function exactText(value, field, { required = false, limit = MAX_INSTRUCTION_LENGTH } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`SECRETARY_DIRECTIVE_REGISTER_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const raw = String(value);
  if (!raw.trim()) {
    if (required) throw new Error(`SECRETARY_DIRECTIVE_REGISTER_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  if (raw.length > limit) throw new Error(`SECRETARY_DIRECTIVE_REGISTER_${field.toUpperCase()}_TOO_LONG`);
  return raw;
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
    if (required) throw new Error(`SECRETARY_DIRECTIVE_REGISTER_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_DIRECTIVE_REGISTER_${field.toUpperCase()}_INVALID`);
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

function safetyFlags() {
  return {
    directive_inferred: false,
    directive_issued_by_secretary: false,
    issuer_inferred: false,
    target_inferred: false,
    due_at_inferred: false,
    execution_link_inferred: false,
    completion_inferred: false,
    payment_authority_created: false,
    signing_authority_created: false,
    booking_authority_created: false,
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
    throw new Error(`SECRETARY_DIRECTIVE_REGISTER_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || canonicalOwner;
  if (actor !== canonicalOwner && actor !== operational) {
    throw new Error("SECRETARY_DIRECTIVE_REGISTER_ACTOR_NOT_AUTHORIZED");
  }
  return { canonicalOwner, operational, routing };
}

async function requireParty(organization, partyId, field) {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_DIRECTIVE_REGISTER_${field}_PARTY_REQUIRED`);
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error(`SECRETARY_DIRECTIVE_REGISTER_${field}_PARTY_NOT_FOUND`);
  if (text(party.status, 80).toUpperCase() === "INACTIVE") {
    throw new Error(`SECRETARY_DIRECTIVE_REGISTER_${field}_PARTY_INACTIVE`);
  }
  return party;
}

async function validateExecutionLinks(organization, { executionTaskId = null, executionJobId = null } = {}) {
  const taskId = text(executionTaskId, 120) || null;
  const jobId = text(executionJobId, 120) || null;
  let task = null;
  let job = null;
  if (taskId) {
    task = await one(
      supabaseAdmin.from("secretary_tasks")
        .select("id,title,status,source,due_at")
        .eq("organization_id", organization)
        .eq("id", taskId)
        .maybeSingle(),
    );
    if (!task) throw new Error("SECRETARY_DIRECTIVE_REGISTER_EXECUTION_TASK_NOT_FOUND");
    if ([SOURCE, "secretary_decision_register"].includes(text(task.source, 120))) {
      throw new Error("SECRETARY_DIRECTIVE_REGISTER_EXECUTION_TASK_INVALID");
    }
  }
  if (jobId) {
    job = await one(
      supabaseAdmin.from("secretary_jobs")
        .select("id,objective,status,next_action_at")
        .eq("organization_id", organization)
        .eq("id", jobId)
        .maybeSingle(),
    );
    if (!job) throw new Error("SECRETARY_DIRECTIVE_REGISTER_EXECUTION_JOB_NOT_FOUND");
  }
  return { task, job };
}

function versionFingerprint({
  instructionText,
  issuerPartyId,
  targetPartyId = null,
  targetText = null,
  dueAt = null,
  evidenceId,
  sourceReference = null,
  instructedAt,
  executionTaskId = null,
  executionJobId = null,
}) {
  return sha256(JSON.stringify({
    instruction_text: instructionText,
    issuer_party_id: issuerPartyId,
    target_party_id: targetPartyId || null,
    target_text: targetText || null,
    due_at: dueAt || null,
    evidence_id: evidenceId,
    source_reference: sourceReference || null,
    instructed_at: instructedAt,
    execution_task_id: executionTaskId || null,
    execution_job_id: executionJobId || null,
  }));
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
    ...safetyFlags(),
  };
}

function ledgerFromTask(task) {
  const raw = object(object(task.metadata)[LEDGER_KEY]);
  if (raw.contract !== CONTRACT) throw new Error("SECRETARY_DIRECTIVE_REGISTER_CONTRACT_INVALID");
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

function latestVersion(ledger) {
  return [...ledger.versions].sort((a, b) => Number(b.version_number || 0) - Number(a.version_number || 0))[0] || null;
}

async function executionSnapshot(organization, version) {
  if (!version) return { task: null, job: null, completion_inferred: false };
  const links = await validateExecutionLinks(organization, {
    executionTaskId: version.execution_task_id,
    executionJobId: version.execution_job_id,
  }).catch((error) => {
    if ([
      "SECRETARY_DIRECTIVE_REGISTER_EXECUTION_TASK_NOT_FOUND",
      "SECRETARY_DIRECTIVE_REGISTER_EXECUTION_JOB_NOT_FOUND",
    ].includes(error?.message)) return { task: null, job: null };
    throw error;
  });
  return {
    task: links.task ? {
      id: links.task.id,
      title: links.task.title,
      status: links.task.status,
      source: links.task.source,
      due_at: links.task.due_at || null,
    } : null,
    job: links.job ? {
      id: links.job.id,
      objective: links.job.objective,
      status: links.job.status,
      next_action_at: links.job.next_action_at || null,
    } : null,
    completion_inferred: false,
  };
}

async function summarizeTask(task) {
  const ledger = ledgerFromTask(task);
  const current = currentVersion(ledger);
  const latest = latestVersion(ledger);
  return {
    directive_id: task.id,
    lineage_id: ledger.lineage_id || task.id,
    state: ledger.state,
    current_version: current,
    latest_version: latest,
    versions: ledger.versions,
    history: ledger.history,
    execution: await executionSnapshot(task.organization_id, current || latest),
    source: task.source,
    entity_id: task.entity_id || null,
    canonical_owner_party_id: object(task.metadata).canonical_owner_party_id || task.owner_party_id || null,
    operational_assignee_party_id: object(task.metadata).operational_assignee_party_id || task.owner_party_id || null,
    ledger_task_status: task.status,
    ledger_task_is_execution_work: false,
    ...safetyFlags(),
  };
}

async function loadDirectiveTask(organization, directiveId) {
  const id = text(directiveId, 120);
  if (!id) throw new Error("SECRETARY_DIRECTIVE_REGISTER_DIRECTIVE_REQUIRED");
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE || object(task.metadata)[LEDGER_KEY]?.contract !== CONTRACT) {
    throw new Error("SECRETARY_DIRECTIVE_REGISTER_DIRECTIVE_NOT_FOUND");
  }
  return task;
}

function directiveVersion({
  versionId,
  versionNumber,
  instructionText,
  issuerPartyId,
  targetPartyId = null,
  targetText = null,
  dueAt = null,
  evidenceId,
  sourceReference = null,
  instructedAt,
  executionTaskId = null,
  executionJobId = null,
  recordedAt,
  actor,
  canonicalOwner,
}) {
  const fingerprint = versionFingerprint({
    instructionText,
    issuerPartyId,
    targetPartyId,
    targetText,
    dueAt,
    evidenceId,
    sourceReference,
    instructedAt,
    executionTaskId,
    executionJobId,
  });
  return {
    version_id: versionId,
    version_number: versionNumber,
    state: "CURRENT",
    instruction_text: instructionText,
    instruction_text_sha256: sha256(instructionText),
    semantic_fingerprint_sha256: fingerprint,
    issuer_party_id: issuerPartyId,
    target_party_id: targetPartyId || null,
    target_text: targetText || null,
    due_at: dueAt || null,
    evidence_id: evidenceId,
    source_reference: sourceReference || null,
    instructed_at: instructedAt,
    execution_task_id: executionTaskId || null,
    execution_job_id: executionJobId || null,
    recorded_at: recordedAt,
    recorded_by_party_id: actor,
    canonical_owner_party_id: canonicalOwner,
    instruction_text_inferred: false,
    issuer_inferred: false,
    target_inferred: false,
    due_at_inferred: false,
    execution_link_inferred: false,
    directive_issued_by_secretary: false,
    ...safetyFlags(),
  };
}

async function insertDirectiveTask({ organization, entityId, directiveId, version, canonicalOwner, operational, routing, actor }) {
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", directiveId)
      .maybeSingle(),
  );
  if (existing) {
    if (existing.source !== SOURCE) throw new Error("SECRETARY_DIRECTIVE_REGISTER_ID_COLLISION");
    const ledger = ledgerFromTask(existing);
    const first = ledger.versions.find((row) => Number(row.version_number) === 1) || null;
    if (first?.semantic_fingerprint_sha256 === version.semantic_fingerprint_sha256) {
      return { task: existing, replay_safe: true };
    }
    throw new Error("SECRETARY_DIRECTIVE_REGISTER_ID_COLLISION");
  }

  const ledger = {
    ...emptyLedger(directiveId),
    revision: 1,
    current_version_id: version.version_id,
    state: "CURRENT",
    versions: [version],
    history: [{
      event: "DIRECTIVE_RECORDED",
      revision: 1,
      version_id: version.version_id,
      semantic_fingerprint_sha256: version.semantic_fingerprint_sha256,
      evidence_id: version.evidence_id,
      instructed_at: version.instructed_at,
      recorded_at: version.recorded_at,
      recorded_by_party_id: actor,
    }],
  };
  const now = new Date().toISOString();
  const inserted = await supabaseAdmin.from("secretary_tasks").insert({
    id: directiveId,
    organization_id: organization,
    entity_id: entityId || null,
    owner_party_id: canonicalOwner,
    title: text(`Directive: ${version.instruction_text}`, 500),
    details: version.instruction_text,
    status: "DONE",
    priority: "NORMAL",
    due_at: null,
    remind_at: null,
    completed_at: now,
    source: SOURCE,
    created_by_party_id: actor,
    metadata: {
      [LEDGER_KEY]: ledger,
      secretary_directive_register: true,
      secretary_directive_register_contract: CONTRACT,
      canonical_owner_party_id: canonicalOwner,
      operational_assignee_party_id: operational,
      ledger_task_is_execution_work: false,
      ...secretaryAdministrativeCoverageMetadata(routing),
      ...safetyFlags(),
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return insertDirectiveTask({ organization, entityId, directiveId, version, canonicalOwner, operational, routing, actor });
    }
    throw inserted.error;
  }
  return { task: inserted.data, replay_safe: false };
}

export async function recordSecretaryExecutiveDirective({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const instructionText = exactText(payload.instruction_text ?? payload.instructionText, "instruction_text", { required: true });
  const issuerPartyId = text(payload.issuer_party_id || payload.issuerPartyId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const instructedAt = iso(payload.instructed_at || payload.instructedAt, "instructed_at", { required: true });
  if (!issuerPartyId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_ISSUER_PARTY_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_EVIDENCE_REQUIRED");
  await requireParty(organization, issuerPartyId, "ISSUER");
  const targetPartyId = text(payload.target_party_id || payload.targetPartyId, 120) || null;
  if (targetPartyId) await requireParty(organization, targetPartyId, "TARGET");
  const targetText = exactText(payload.target_text ?? payload.targetText, "target_text", { required: false, limit: 2000 });
  const dueAt = iso(payload.due_at || payload.dueAt, "due_at");
  const sourceReference = text(payload.source_reference || payload.sourceReference, 2000) || null;
  const executionTaskId = text(payload.execution_task_id || payload.executionTaskId, 120) || null;
  const executionJobId = text(payload.execution_job_id || payload.executionJobId, 120) || null;
  await validateExecutionLinks(organization, { executionTaskId, executionJobId });
  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Record evidence of an already-issued executive instruction in the directive register without converting it into a decision, preference, commitment, or grant of authority.",
  });
  const semanticFingerprint = versionFingerprint({
    instructionText,
    issuerPartyId,
    targetPartyId,
    targetText,
    dueAt,
    evidenceId,
    sourceReference,
    instructedAt,
    executionTaskId,
    executionJobId,
  });
  const directiveId = deterministicUuid(`avantiqo-secretary-directive-register-v1:${organization}:${semanticFingerprint}`);
  const versionId = deterministicUuid(`${directiveId}:version:1`);
  const recordedAt = new Date().toISOString();
  const version = directiveVersion({
    versionId,
    versionNumber: 1,
    instructionText,
    issuerPartyId,
    targetPartyId,
    targetText,
    dueAt,
    evidenceId,
    sourceReference,
    instructedAt,
    executionTaskId,
    executionJobId,
    recordedAt,
    actor,
    canonicalOwner: auth.canonicalOwner,
  });
  const created = await insertDirectiveTask({
    organization,
    entityId: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    directiveId,
    version,
    canonicalOwner: auth.canonicalOwner,
    operational: auth.operational,
    routing: auth.routing,
    actor,
  });
  return {
    status: "recorded",
    contract: CONTRACT,
    directive: await summarizeTask(created.task),
    replay_safe: created.replay_safe,
    evidence_required: true,
    instruction_text_preserved_exactly: true,
    ledger_task_is_execution_work: false,
    ...safetyFlags(),
  };
}

async function mutateDirective({ context, directiveId, instruction, producer }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const auth = await administrativeRouting({ organization, actor, instruction });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await loadDirectiveTask(organization, directiveId);
    const ledger = ledgerFromTask(task);
    const produced = await producer({ task, ledger, actor, auth, organization });
    if (produced.replay_safe === true) {
      return { task, ledger, output: object(produced.output), replay_safe: true };
    }
    const metadata = {
      ...object(task.metadata),
      [LEDGER_KEY]: produced.ledger,
      secretary_directive_register: true,
      secretary_directive_register_contract: CONTRACT,
      canonical_owner_party_id: auth.canonicalOwner,
      operational_assignee_party_id: auth.operational,
      ledger_task_is_execution_work: false,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      ...safetyFlags(),
    };
    const patch = {
      ...object(produced.task_patch),
      due_at: null,
      remind_at: null,
      status: "DONE",
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
  throw new Error("SECRETARY_DIRECTIVE_REGISTER_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function supersedeSecretaryExecutiveDirective({ context, payload = {} } = {}) {
  const directiveId = payload.directive_id || payload.directiveId;
  const supersedesVersionId = text(payload.supersedes_version_id || payload.supersedesVersionId, 120);
  const replacementInstructionText = exactText(payload.replacement_instruction_text ?? payload.replacementInstructionText, "replacement_instruction_text", { required: true });
  const issuerPartyId = text(payload.issuer_party_id || payload.issuerPartyId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const instructedAt = iso(payload.instructed_at || payload.instructedAt, "instructed_at", { required: true });
  if (!supersedesVersionId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_SUPERSEDES_VERSION_REQUIRED");
  if (!issuerPartyId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_ISSUER_PARTY_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_EVIDENCE_REQUIRED");
  const organization = organizationId(context);
  await requireParty(organization, issuerPartyId, "ISSUER");
  const targetPartyId = text(payload.target_party_id || payload.targetPartyId, 120) || null;
  if (targetPartyId) await requireParty(organization, targetPartyId, "TARGET");
  const targetText = exactText(payload.target_text ?? payload.targetText, "target_text", { required: false, limit: 2000 });
  const dueAt = iso(payload.due_at || payload.dueAt, "due_at");
  const sourceReference = text(payload.source_reference || payload.sourceReference, 2000) || null;
  const executionTaskId = text(payload.execution_task_id || payload.executionTaskId, 120) || null;
  const executionJobId = text(payload.execution_job_id || payload.executionJobId, 120) || null;
  await validateExecutionLinks(organization, { executionTaskId, executionJobId });
  const replacementFingerprint = versionFingerprint({
    instructionText: replacementInstructionText,
    issuerPartyId,
    targetPartyId,
    targetText,
    dueAt,
    evidenceId,
    sourceReference,
    instructedAt,
    executionTaskId,
    executionJobId,
  });
  const result = await mutateDirective({
    context,
    directiveId,
    instruction: "Record explicit evidence that one executive instruction was superseded by another already-issued instruction while preserving both versions and without inferring authority.",
    producer: async ({ ledger, actor, auth }) => {
      const replayEvent = ledger.history.find((row) => row.event === "DIRECTIVE_SUPERSEDED"
        && row.supersedes_version_id === supersedesVersionId
        && row.evidence_id === evidenceId
        && row.instructed_at === instructedAt
        && row.replacement_fingerprint_sha256 === replacementFingerprint);
      if (replayEvent) {
        const replayVersion = ledger.versions.find((row) => row.version_id === replayEvent.version_id);
        if (replayVersion?.semantic_fingerprint_sha256 === replacementFingerprint) {
          return { replay_safe: true, output: { version: replayVersion } };
        }
      }
      const current = currentVersion(ledger);
      if (!current || current.version_id !== supersedesVersionId || ledger.state !== "CURRENT") {
        throw new Error("SECRETARY_DIRECTIVE_REGISTER_STALE_SUPERSESSION_REJECTED");
      }
      const versionNumber = Math.max(0, ...ledger.versions.map((row) => Number(row.version_number || 0))) + 1;
      const newVersionId = deterministicUuid(`${ledger.lineage_id}:version:${versionNumber}:${replacementFingerprint}`);
      const revision = Number(ledger.revision || 0) + 1;
      const now = new Date().toISOString();
      const versions = ledger.versions.map((row) => row.version_id === supersedesVersionId
        ? {
          ...row,
          state: "SUPERSEDED",
          superseded_at: instructedAt,
          superseded_by_version_id: newVersionId,
          supersession_evidence_id: evidenceId,
        }
        : row);
      const replacement = directiveVersion({
        versionId: newVersionId,
        versionNumber,
        instructionText: replacementInstructionText,
        issuerPartyId,
        targetPartyId,
        targetText,
        dueAt,
        evidenceId,
        sourceReference,
        instructedAt,
        executionTaskId,
        executionJobId,
        recordedAt: now,
        actor,
        canonicalOwner: auth.canonicalOwner,
      });
      versions.push(replacement);
      return {
        ledger: {
          ...ledger,
          revision,
          current_version_id: newVersionId,
          state: "CURRENT",
          versions: versions.slice(-200),
          history: [...ledger.history, {
            event: "DIRECTIVE_SUPERSEDED",
            revision,
            supersedes_version_id: supersedesVersionId,
            version_id: newVersionId,
            evidence_id: evidenceId,
            instructed_at: instructedAt,
            replacement_fingerprint_sha256: replacementFingerprint,
            recorded_at: now,
            recorded_by_party_id: actor,
          }].slice(-500),
        },
        task_patch: {
          title: text(`Directive: ${replacementInstructionText}`, 500),
          details: replacementInstructionText,
        },
        output: { version: replacement },
      };
    },
  });
  return {
    status: "superseded",
    contract: CONTRACT,
    directive: await summarizeTask(result.task),
    replay_safe: result.replay_safe,
    stale_supersession_fenced: true,
    instruction_text_preserved_exactly: true,
    ...safetyFlags(),
  };
}

export async function linkSecretaryDirectiveExecution({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const directiveId = payload.directive_id || payload.directiveId;
  const currentVersionId = text(payload.current_version_id || payload.currentVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const executionTaskId = text(payload.execution_task_id || payload.executionTaskId, 120) || null;
  const executionJobId = text(payload.execution_job_id || payload.executionJobId, 120) || null;
  if (!currentVersionId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_CURRENT_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_EVIDENCE_REQUIRED");
  if (!executionTaskId && !executionJobId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_EXECUTION_LINK_REQUIRED");
  await validateExecutionLinks(organization, { executionTaskId, executionJobId });
  const result = await mutateDirective({
    context,
    directiveId,
    instruction: "Link explicit existing execution work to a current executive directive without creating the work, changing the directive, or inferring completion.",
    producer: async ({ ledger, actor }) => {
      const exactReplay = ledger.history.some((row) => row.event === "DIRECTIVE_EXECUTION_LINKED"
        && row.version_id === currentVersionId
        && row.evidence_id === evidenceId
        && (executionTaskId ? row.execution_task_id === executionTaskId : true)
        && (executionJobId ? row.execution_job_id === executionJobId : true));
      if (exactReplay) return { replay_safe: true };
      const current = currentVersion(ledger);
      if (!current || current.version_id !== currentVersionId || ledger.state !== "CURRENT") {
        throw new Error("SECRETARY_DIRECTIVE_REGISTER_STALE_EXECUTION_LINK_REJECTED");
      }
      const revision = Number(ledger.revision || 0) + 1;
      const now = new Date().toISOString();
      const versions = ledger.versions.map((row) => row.version_id === currentVersionId
        ? {
          ...row,
          execution_task_id: executionTaskId || row.execution_task_id || null,
          execution_job_id: executionJobId || row.execution_job_id || null,
          execution_link_inferred: false,
        }
        : row);
      return {
        ledger: {
          ...ledger,
          revision,
          versions,
          history: [...ledger.history, {
            event: "DIRECTIVE_EXECUTION_LINKED",
            revision,
            version_id: currentVersionId,
            execution_task_id: executionTaskId,
            execution_job_id: executionJobId,
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
    directive: await summarizeTask(result.task),
    replay_safe: result.replay_safe,
    execution_link_inferred: false,
    completion_inferred: false,
    ...safetyFlags(),
  };
}

export async function completeSecretaryExecutiveDirective({ context, payload = {} } = {}) {
  const directiveId = payload.directive_id || payload.directiveId;
  const currentVersionId = text(payload.current_version_id || payload.currentVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const completedAt = iso(payload.completed_at || payload.completedAt, "completed_at", { required: true });
  if (!currentVersionId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_CURRENT_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_EVIDENCE_REQUIRED");
  const result = await mutateDirective({
    context,
    directiveId,
    instruction: "Record explicit completion evidence for a current executive directive. Linked task or job status alone must never imply directive completion.",
    producer: async ({ ledger, actor }) => {
      const exactReplay = ledger.history.some((row) => row.event === "DIRECTIVE_COMPLETED"
        && row.version_id === currentVersionId
        && row.evidence_id === evidenceId
        && row.completed_at === completedAt);
      if (exactReplay) return { replay_safe: true };
      const current = currentVersion(ledger);
      if (!current || current.version_id !== currentVersionId || ledger.state !== "CURRENT") {
        throw new Error("SECRETARY_DIRECTIVE_REGISTER_STALE_COMPLETION_REJECTED");
      }
      const revision = Number(ledger.revision || 0) + 1;
      const now = new Date().toISOString();
      const versions = ledger.versions.map((row) => row.version_id === currentVersionId
        ? {
          ...row,
          state: "COMPLETED",
          completed_at: completedAt,
          completion_evidence_id: evidenceId,
          completion_source_reference: text(payload.source_reference || payload.sourceReference, 2000) || null,
          completion_result: exactText(payload.result, "completion_result", { required: false, limit: 10000 }),
        }
        : row);
      return {
        ledger: {
          ...ledger,
          revision,
          current_version_id: null,
          state: "COMPLETED",
          versions,
          history: [...ledger.history, {
            event: "DIRECTIVE_COMPLETED",
            revision,
            version_id: currentVersionId,
            evidence_id: evidenceId,
            source_reference: text(payload.source_reference || payload.sourceReference, 2000) || null,
            result: exactText(payload.result, "completion_result", { required: false, limit: 10000 }),
            completed_at: completedAt,
            recorded_at: now,
            recorded_by_party_id: actor,
          }].slice(-500),
        },
        task_patch: {},
      };
    },
  });
  return {
    status: "completed",
    contract: CONTRACT,
    directive: await summarizeTask(result.task),
    replay_safe: result.replay_safe,
    completion_evidence_required: true,
    completion_inferred: false,
    ...safetyFlags(),
  };
}

export async function cancelSecretaryExecutiveDirective({ context, payload = {} } = {}) {
  const directiveId = payload.directive_id || payload.directiveId;
  const currentVersionId = text(payload.current_version_id || payload.currentVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const cancelledAt = iso(payload.cancelled_at || payload.cancelledAt, "cancelled_at", { required: true });
  if (!currentVersionId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_CURRENT_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_REGISTER_EVIDENCE_REQUIRED");
  const result = await mutateDirective({
    context,
    directiveId,
    instruction: "Record explicit evidence that a current executive directive was cancelled or withdrawn. Do not infer a replacement instruction.",
    producer: async ({ ledger, actor }) => {
      const exactReplay = ledger.history.some((row) => row.event === "DIRECTIVE_CANCELLED"
        && row.version_id === currentVersionId
        && row.evidence_id === evidenceId
        && row.cancelled_at === cancelledAt);
      if (exactReplay) return { replay_safe: true };
      const current = currentVersion(ledger);
      if (!current || current.version_id !== currentVersionId || ledger.state !== "CURRENT") {
        throw new Error("SECRETARY_DIRECTIVE_REGISTER_STALE_CANCELLATION_REJECTED");
      }
      const revision = Number(ledger.revision || 0) + 1;
      const now = new Date().toISOString();
      const versions = ledger.versions.map((row) => row.version_id === currentVersionId
        ? {
          ...row,
          state: "CANCELLED",
          cancelled_at: cancelledAt,
          cancellation_evidence_id: evidenceId,
        }
        : row);
      return {
        ledger: {
          ...ledger,
          revision,
          current_version_id: null,
          state: "CANCELLED",
          versions,
          history: [...ledger.history, {
            event: "DIRECTIVE_CANCELLED",
            revision,
            version_id: currentVersionId,
            evidence_id: evidenceId,
            source_reference: text(payload.source_reference || payload.sourceReference, 2000) || null,
            reason: exactText(payload.reason, "cancellation_reason", { required: false, limit: 10000 }),
            cancelled_at: cancelledAt,
            recorded_at: now,
            recorded_by_party_id: actor,
          }].slice(-500),
        },
        task_patch: {},
      };
    },
  });
  return {
    status: "cancelled",
    contract: CONTRACT,
    directive: await summarizeTask(result.task),
    replay_safe: result.replay_safe,
    stale_cancellation_fenced: true,
    replacement_directive_inferred: false,
    ...safetyFlags(),
  };
}

export async function readSecretaryExecutiveDirective({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadDirectiveTask(organization, payload.directive_id || payload.directiveId);
  return {
    status: "completed",
    contract: CONTRACT,
    directive: await summarizeTask(task),
    evidence_only: true,
    durable_record_only: true,
    ...safetyFlags(),
  };
}

export async function listSecretaryExecutiveDirectives({ context, payload = {} } = {}) {
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
  const directives = await Promise.all(tasks.map((task) => summarizeTask(task)));
  return {
    status: "completed",
    contract: CONTRACT,
    directives,
    current_directives: directives.filter((item) => item.state === "CURRENT"),
    completed_directives: directives.filter((item) => item.state === "COMPLETED"),
    cancelled_directives: directives.filter((item) => item.state === "CANCELLED"),
    summary: {
      returned_lineages: directives.length,
      current_lineages: directives.filter((item) => item.state === "CURRENT").length,
      completed_lineages: directives.filter((item) => item.state === "COMPLETED").length,
      cancelled_lineages: directives.filter((item) => item.state === "CANCELLED").length,
      version_count: directives.reduce((sum, item) => sum + item.versions.length, 0),
    },
    evidence_only: true,
    durable_records_only: true,
    ledger_rows_are_execution_work: false,
    ...safetyFlags(),
  };
}

export default Object.freeze({
  record: recordSecretaryExecutiveDirective,
  supersede: supersedeSecretaryExecutiveDirective,
  linkExecution: linkSecretaryDirectiveExecution,
  complete: completeSecretaryExecutiveDirective,
  cancel: cancelSecretaryExecutiveDirective,
  read: readSecretaryExecutiveDirective,
  list: listSecretaryExecutiveDirectives,
});
