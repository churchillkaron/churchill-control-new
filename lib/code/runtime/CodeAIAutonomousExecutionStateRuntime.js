import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  verifyCodeMissionStateAttestation,
} from "@/lib/code/runtime/CodeMissionAttestationRuntime";

export const CODE_AI_AUTONOMOUS_EXECUTION_STATE_CONTRACT =
  "AVANTIQO_CODE_AI_AUTONOMOUS_EXECUTION_STATE_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_execution_state";
const MEMORY_SOURCE = "code_ai_autonomous_execution";
const EXECUTION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$/;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function normalizeExecutionKey(value) {
  const key = text(value, 160);
  if (!EXECUTION_KEY_PATTERN.test(key)) {
    throw new Error("CODE_AI_AUTONOMOUS_EXECUTION_KEY_INVALID");
  }
  return key;
}

function memoryKey(actor, executionKey) {
  const digest = crypto
    .createHash("sha256")
    .update(`${actor}:${executionKey}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `code_ai_autonomous_execution:v1:${digest}`;
}

function productCompletionCriteria(state) {
  const context = object(state?.objective_context);
  return [
    context.completion_criterion_1,
    context.completion_criterion_2,
    context.completion_criterion_3,
    context.completion_criterion_4,
    context.completion_criterion_5,
    context.completion_criterion_6,
  ]
    .map((criterion) => text(criterion, 700))
    .filter(Boolean);
}

function productCompletionCriteriaProjection(state) {
  const criteria = productCompletionCriteria(state);
  if (!criteria.length) {
    return {
      required: false,
      criteria: [],
      criteria_count: 0,
      evidence_count: 0,
      verified: true,
    };
  }

  const observedOperationIds = new Set([
    ...list(state?.completed_operation_ids)
      .map((item) => text(item, 200))
      .filter(Boolean),
    ...list(state?.verification)
      .map((item) => text(item?.operation_id, 200))
      .filter(Boolean),
  ]);
  const evidenceEntry = [...list(state?.evidence)]
    .reverse()
    .find((item) =>
      item?.kind === "product_completion_criteria_evidence" &&
      item?.verified === true,
    );
  const supplied = list(evidenceEntry?.criteria_evidence);
  const byCriterion = new Map();
  let invalid = false;

  for (const item of supplied) {
    const criterion = text(item?.criterion, 700);
    if (!criteria.includes(criterion)) {
      invalid = true;
      continue;
    }
    const operationIds = [...new Set(
      list(item?.evidence_operation_ids)
        .map((operationId) => text(operationId, 200))
        .filter(Boolean),
    )].slice(0, 12);
    if (
      !operationIds.length ||
      operationIds.some((operationId) => !observedOperationIds.has(operationId))
    ) {
      invalid = true;
      continue;
    }
    const existing = byCriterion.get(criterion) || [];
    byCriterion.set(
      criterion,
      [...new Set([...existing, ...operationIds])].slice(0, 12),
    );
  }

  const verified =
    !invalid &&
    criteria.every((criterion) => byCriterion.has(criterion));
  return {
    required: true,
    criteria,
    criteria_count: criteria.length,
    evidence_count: byCriterion.size,
    verified,
  };
}

function verificationProjection(result = {}) {
  const state = object(result.state);
  if (!Object.keys(state).length) {
    throw new Error("CODE_AI_AUTONOMOUS_EXECUTION_STATE_REQUIRED");
  }
  verifyCodeMissionStateAttestation(state);

  const verification = list(state.verification).slice(-20).map((item) => ({
    at: text(item?.at, 120) || null,
    operation_id: text(item?.operation_id, 200) || null,
    passed: item?.passed === true,
  }));
  const filesChanged = list(state.files_changed)
    .map((item) => text(item, 500))
    .filter(Boolean)
    .slice(0, 100);
  const sourceChangeCount = list(state.source_changes).length;
  const completionCriteria = productCompletionCriteriaProjection(state);

  return {
    contract: CODE_AI_AUTONOMOUS_EXECUTION_STATE_CONTRACT,
    result_success: result.success === true,
    result_status: text(result.status, 100) || null,
    summary: text(result.summary, 2000) || null,
    mission_id: text(state.mission_id, 200) || null,
    objective: text(state.objective, 4000) || null,
    repository_url: text(state.repository_url, 500) || null,
    ref: text(state.ref, 160) || null,
    base_commit: text(state.base_commit, 120) || null,
    state_status: text(state.status, 100) || null,
    current_operation_id: text(state.current_operation_id, 200) || null,
    completed_operation_count: list(state.completed_operation_ids).length,
    files_changed: filesChanged,
    source_change_count: sourceChangeCount,
    patch_present: Boolean(text(state.patch, 1)),
    verification,
    verification_passed: verification.some((item) => item.passed === true),
    product_completion_criteria_required: completionCriteria.required,
    product_completion_criteria: completionCriteria.criteria,
    product_completion_criteria_count: completionCriteria.criteria_count,
    product_completion_criteria_evidence_count: completionCriteria.evidence_count,
    product_completion_criteria_verified: completionCriteria.verified,
    product_completion_criteria_authorization_effect: "NONE",
    failure_count: list(state.failures).length,
    blocker_count: list(state.blockers).length,
    attestation_contract: text(state.attestation?.contract, 160) || null,
    attestation_digest: text(state.attestation?.digest, 128) || null,
    attestation_verified: true,
    recorded_at: new Date().toISOString(),
  };
}

function contentFor(record) {
  const changed = Number(record.source_change_count || 0);
  const verification = record.verification_passed ? "verified" : "not verified";
  const completionCriteria = Number(record.product_completion_criteria_count || 0);
  const completionCriteriaStatus = record.product_completion_criteria_verified
    ? "verified"
    : "not verified";
  return [
    "Server-owned Code AI autonomous execution evidence.",
    `Status: ${record.result_status || record.state_status || "unknown"}.`,
    `Source changes: ${changed}.`,
    `Verification: ${verification}.`,
    `Product completion criteria: ${completionCriteria} (${completionCriteriaStatus}).`,
    "This record is execution evidence for registered verification and is excluded from ordinary Intelligence memory recall by its dedicated scope.",
  ].join(" ");
}

export async function persistCodeAIAutonomousExecutionState({
  context = {},
  executionKey,
  result,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  const actor = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_EXECUTION_STATE_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_EXECUTION_STATE_ACTOR_REQUIRED");
  const key = normalizeExecutionKey(executionKey);
  const record = verificationProjection(result);
  const rowKey = memoryKey(actor, key);
  const now = new Date().toISOString();

  const persisted = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert({
      organization_id: organizationId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: rowKey,
      memory_type: "fact",
      subject: "Code AI Autonomous Execution State",
      content: contentFor(record),
      importance: 0.1,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: CODE_AI_AUTONOMOUS_EXECUTION_STATE_CONTRACT,
        execution_key: key,
        actor_id: actor,
        execution_state: record,
        ordinary_memory_recall: false,
        authorization_effect: "NONE",
      },
      updated_at: now,
    }, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id,updated_at")
    .maybeSingle();

  if (persisted.error) throw persisted.error;
  if (!persisted.data?.id) {
    throw new Error("CODE_AI_AUTONOMOUS_EXECUTION_STATE_PERSIST_FAILED");
  }

  return {
    persisted: true,
    row_id: persisted.data.id,
    updated_at: persisted.data.updated_at || now,
    execution_state: record,
  };
}

export async function loadCodeAIAutonomousExecutionState({
  context = {},
  executionKey,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  const actor = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_EXECUTION_STATE_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_EXECUTION_STATE_ACTOR_REQUIRED");
  const key = normalizeExecutionKey(executionKey);
  const rowKey = memoryKey(actor, key);

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,memory_scope,memory_key,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", rowKey)
    .eq("active", true)
    .maybeSingle();

  if (result.error) throw result.error;
  const row = result.data || null;
  if (!row?.id) return { found: false, execution_state: null };
  const metadata = object(row.metadata);
  if (text(metadata.actor_id, 160) !== actor || text(metadata.execution_key, 160) !== key) {
    throw new Error("CODE_AI_AUTONOMOUS_EXECUTION_STATE_SCOPE_MISMATCH");
  }

  return {
    found: true,
    row_id: row.id,
    updated_at: row.updated_at || null,
    execution_state: object(metadata.execution_state),
  };
}

export function verifyCompletedCodeAIAutonomousExecution(record = {}) {
  const state = object(record);
  if (state.contract !== CODE_AI_AUTONOMOUS_EXECUTION_STATE_CONTRACT) {
    throw new Error("CODE_AI_AUTONOMOUS_EXECUTION_STATE_CONTRACT_INVALID");
  }
  if (state.attestation_verified !== true) {
    throw new Error("CODE_AI_AUTONOMOUS_EXECUTION_ATTESTATION_NOT_VERIFIED");
  }
  if (state.result_success !== true || state.result_status !== "completed") {
    throw new Error(`CODE_AI_AUTONOMOUS_EXECUTION_NOT_COMPLETED:${state.result_status || "unknown"}`);
  }
  if (state.state_status !== "completed") {
    throw new Error(`CODE_AI_AUTONOMOUS_STATE_NOT_COMPLETED:${state.state_status || "unknown"}`);
  }
  if (
    Number(state.product_completion_criteria_count || 0) > 0 &&
    state.product_completion_criteria_verified !== true
  ) {
    throw new Error("CODE_AI_AUTONOMOUS_PRODUCT_COMPLETION_CRITERIA_NOT_VERIFIED");
  }
  if (Number(state.source_change_count || 0) > 0 && state.verification_passed !== true) {
    throw new Error("CODE_AI_AUTONOMOUS_CHANGED_STATE_NOT_VERIFIED");
  }
  if (Number(state.failure_count || 0) > 0 && state.verification_passed !== true) {
    throw new Error("CODE_AI_AUTONOMOUS_FAILURES_WITHOUT_VERIFIED_REPAIR");
  }
  return true;
}

export const CodeAIAutonomousExecutionStateRuntime = Object.freeze({
  contract: CODE_AI_AUTONOMOUS_EXECUTION_STATE_CONTRACT,
  persist: persistCodeAIAutonomousExecutionState,
  load: loadCodeAIAutonomousExecutionState,
  verifyCompleted: verifyCompletedCodeAIAutonomousExecution,
});

export default CodeAIAutonomousExecutionStateRuntime;