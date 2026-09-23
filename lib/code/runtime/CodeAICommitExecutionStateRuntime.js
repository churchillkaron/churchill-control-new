import crypto from "node:crypto";

import { supabaseAdmin } from "../../shared/supabase/admin.js";

export const CODE_AI_COMMIT_EXECUTION_STATE_CONTRACT =
  "AVANTIQO_CODE_AI_COMMIT_EXECUTION_STATE_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_commit_execution_state";
const MEMORY_SOURCE = "code_ai_commit_execution";
const EXECUTION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$/;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
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
    throw new Error("CODE_AI_COMMIT_EXECUTION_KEY_INVALID");
  }
  return key;
}

function stateKey(actor, executionKey) {
  const digest = crypto
    .createHash("sha256")
    .update(`${actor}:${executionKey}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `code_ai_commit_execution:v1:${digest}`;
}

function normalizedCommitResult(result = {}) {
  const source = object(result);
  if (
    source.success !== true ||
    source.verified !== true ||
    text(source.branch, 160) !== "main" ||
    !text(source.commit_sha, 160) ||
    !text(source.previous_commit, 160) ||
    !text(source.tree_sha, 160)
  ) {
    throw new Error("CODE_AI_COMMIT_RESULT_NOT_VERIFIED");
  }
  return {
    contract: CODE_AI_COMMIT_EXECUTION_STATE_CONTRACT,
    success: true,
    verified: true,
    repository: text(source.repository, 500) || null,
    branch: "main",
    previous_commit: text(source.previous_commit, 160),
    commit_sha: text(source.commit_sha, 160),
    tree_sha: text(source.tree_sha, 160),
    file_count: Number(source.file_count || 0),
    source_bytes: Number(source.source_bytes || 0),
    force: source.force === true,
    recorded_at: new Date().toISOString(),
  };
}

export async function persistCodeAICommitExecutionState({
  context = {},
  executionKey,
  result,
  missionState = null,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  const actor = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_COMMIT_STATE_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_COMMIT_STATE_ACTOR_REQUIRED");
  const key = normalizeExecutionKey(executionKey);
  const commit = normalizedCommitResult(result);
  const mission = object(missionState);
  const review = object(mission.review_delivery);
  const releaseCertification = object(mission.release_certification);
  const boundedRelease = {
    review_verified: review.verified === true,
    review_commit_sha: text(review.commit_sha, 160) || null,
    review_branch: text(review.review_branch, 240) || null,
    pull_request_number: Number(review.pull_request_number || 0) || null,
    release_certified: releaseCertification.verified === true,
    certified_review_commit_sha: text(releaseCertification.review_commit_sha, 160) || null,
    preview_deployment_id: text(releaseCertification?.deployment?.deployment_id, 300) || null,
    certified_at: text(releaseCertification.certified_at, 100) || null,
  };
  if (boundedRelease.release_certified === true && boundedRelease.certified_review_commit_sha !== commit.commit_sha) {
    throw new Error("CODE_AI_COMMIT_STATE_CERTIFIED_COMMIT_MISMATCH");
  }
  if (boundedRelease.review_verified === true && boundedRelease.review_commit_sha !== commit.commit_sha) {
    throw new Error("CODE_AI_COMMIT_STATE_REVIEW_COMMIT_MISMATCH");
  }
  const rowKey = stateKey(actor, key);
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
      subject: "Code AI Commit Verification State",
      content: `Verified Code AI GitHub commit ${commit.commit_sha} on main.`,
      importance: 0.05,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: CODE_AI_COMMIT_EXECUTION_STATE_CONTRACT,
        execution_key: key,
        actor_id: actor,
        commit,
        release: boundedRelease,
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
  if (!persisted.data?.id) throw new Error("CODE_AI_COMMIT_STATE_PERSIST_FAILED");

  return {
    persisted: true,
    execution_key: key,
    row_id: persisted.data.id,
    updated_at: persisted.data.updated_at || now,
    commit,
    release: boundedRelease,
  };
}

export async function loadCodeAICommitExecutionState({
  context = {},
  executionKey,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  const actor = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_COMMIT_STATE_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_COMMIT_STATE_ACTOR_REQUIRED");
  const key = normalizeExecutionKey(executionKey);
  const rowKey = stateKey(actor, key);

  const loaded = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", rowKey)
    .eq("active", true)
    .maybeSingle();

  if (loaded.error) throw loaded.error;
  if (!loaded.data?.id) return { found: false, commit: null };

  const metadata = object(loaded.data.metadata);
  if (
    text(metadata.contract, 160) !== CODE_AI_COMMIT_EXECUTION_STATE_CONTRACT ||
    text(metadata.execution_key, 160) !== key ||
    text(metadata.actor_id, 160) !== actor
  ) {
    throw new Error("CODE_AI_COMMIT_STATE_SCOPE_MISMATCH");
  }

  const commit = object(metadata.commit);
  const release = object(metadata.release);
  if (
    commit.contract !== CODE_AI_COMMIT_EXECUTION_STATE_CONTRACT ||
    commit.success !== true ||
    commit.verified !== true ||
    text(commit.branch, 160) !== "main" ||
    !text(commit.commit_sha, 160)
  ) {
    throw new Error("CODE_AI_COMMIT_STATE_INVALID");
  }

  return {
    found: true,
    execution_key: key,
    row_id: loaded.data.id,
    updated_at: loaded.data.updated_at || null,
    commit,
    release,
  };
}

export const CodeAICommitExecutionStateRuntime = Object.freeze({
  contract: CODE_AI_COMMIT_EXECUTION_STATE_CONTRACT,
  persist: persistCodeAICommitExecutionState,
  load: loadCodeAICommitExecutionState,
});

export default CodeAICommitExecutionStateRuntime;
