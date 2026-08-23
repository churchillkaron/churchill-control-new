import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  verifyCodeMissionStateAttestation,
} from "@/lib/code/runtime/CodeMissionAttestationRuntime";

export const CODE_AI_COMMIT_ARTIFACT_CONTRACT =
  "AVANTIQO_CODE_AI_COMMIT_ARTIFACT_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_commit_artifact";
const MEMORY_SOURCE = "code_ai_commit_artifact";
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
    throw new Error("CODE_AI_COMMIT_ARTIFACT_EXECUTION_KEY_INVALID");
  }
  return key;
}

function artifactKey(actor, executionKey) {
  const digest = crypto
    .createHash("sha256")
    .update(`${actor}:${executionKey}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `code_ai_commit_artifact:v1:${digest}`;
}

function validateMissionScope(state, { organizationId, actor }) {
  verifyCodeMissionStateAttestation(state);
  if (text(state.organization_id, 160) !== organizationId) {
    throw new Error("CODE_AI_COMMIT_ARTIFACT_ORGANIZATION_MISMATCH");
  }
  if (text(state.actor_id, 160) !== actor) {
    throw new Error("CODE_AI_COMMIT_ARTIFACT_ACTOR_MISMATCH");
  }
}

function validateArtifactMetadata(metadata, { key, actor }) {
  if (
    text(metadata.contract, 160) !== CODE_AI_COMMIT_ARTIFACT_CONTRACT ||
    text(metadata.execution_key, 160) !== key ||
    text(metadata.actor_id, 160) !== actor
  ) {
    throw new Error("CODE_AI_COMMIT_ARTIFACT_SCOPE_MISMATCH");
  }
}

async function activeArtifactRow({ organizationId, actor, key }) {
  const rowKey = artifactKey(actor, key);
  const loaded = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", rowKey)
    .eq("active", true)
    .maybeSingle();

  if (loaded.error) throw loaded.error;
  return loaded.data || null;
}

export async function persistCodeAICommitArtifact({
  context = {},
  executionKey,
  missionState,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  const actor = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_COMMIT_ARTIFACT_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_COMMIT_ARTIFACT_ACTOR_REQUIRED");
  const key = normalizeExecutionKey(executionKey);
  const state = object(missionState);
  if (!Object.keys(state).length) throw new Error("CODE_AI_COMMIT_ARTIFACT_STATE_REQUIRED");
  validateMissionScope(state, { organizationId, actor });

  const existing = await activeArtifactRow({ organizationId, actor, key });
  if (existing?.id) {
    const existingMetadata = object(existing.metadata);
    validateArtifactMetadata(existingMetadata, { key, actor });
    if (existingMetadata.commit_attempted === true) {
      throw new Error("CODE_AI_COMMIT_ARTIFACT_ATTEMPTED_IMMUTABLE");
    }
  }

  const rowKey = artifactKey(actor, key);
  const now = new Date().toISOString();
  const sourceChangeCount = Array.isArray(state.source_changes)
    ? state.source_changes.length
    : 0;

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
      subject: "Code AI Commit Artifact",
      content: [
        "Server-owned attested Code AI source artifact for a separately governed GitHub commit.",
        `Source changes: ${sourceChangeCount}.`,
        "The full mission state is stored only in metadata and is excluded from ordinary Intelligence recall.",
      ].join(" "),
      importance: 0.05,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: CODE_AI_COMMIT_ARTIFACT_CONTRACT,
        execution_key: key,
        actor_id: actor,
        repository_url: text(state.repository_url, 500) || null,
        ref: text(state.ref, 160) || null,
        base_commit: text(state.base_commit, 160) || null,
        attestation_digest: text(state.attestation?.digest, 160) || null,
        source_change_count: sourceChangeCount,
        mission_state: state,
        commit_attempted: false,
        commit_attempted_at: null,
        commit_attempt_count: 0,
        ordinary_memory_recall: false,
        authorization_effect: "NONE",
        commit_requires_separate_governed_capability: true,
      },
      updated_at: now,
    }, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id,updated_at")
    .maybeSingle();

  if (persisted.error) throw persisted.error;
  if (!persisted.data?.id) throw new Error("CODE_AI_COMMIT_ARTIFACT_PERSIST_FAILED");

  return {
    persisted: true,
    execution_key: key,
    row_id: persisted.data.id,
    updated_at: persisted.data.updated_at || now,
    source_change_count: sourceChangeCount,
    commit_attempted: false,
  };
}

export async function loadCodeAICommitArtifact({
  context = {},
  executionKey,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  const actor = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_COMMIT_ARTIFACT_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_COMMIT_ARTIFACT_ACTOR_REQUIRED");
  const key = normalizeExecutionKey(executionKey);

  const loaded = await activeArtifactRow({ organizationId, actor, key });
  if (!loaded?.id) return { found: false, mission_state: null };

  const metadata = object(loaded.metadata);
  validateArtifactMetadata(metadata, { key, actor });

  const state = object(metadata.mission_state);
  if (!Object.keys(state).length) throw new Error("CODE_AI_COMMIT_ARTIFACT_STATE_MISSING");
  validateMissionScope(state, { organizationId, actor });

  if (
    text(metadata.attestation_digest, 160) &&
    text(metadata.attestation_digest, 160) !== text(state.attestation?.digest, 160)
  ) {
    throw new Error("CODE_AI_COMMIT_ARTIFACT_ATTESTATION_DIGEST_MISMATCH");
  }

  return {
    found: true,
    execution_key: key,
    row_id: loaded.id,
    updated_at: loaded.updated_at || null,
    mission_state: state,
    commit_attempted: metadata.commit_attempted === true,
    commit_attempted_at: text(metadata.commit_attempted_at, 100) || null,
    commit_attempt_count: Number(metadata.commit_attempt_count || 0),
  };
}

export async function markCodeAICommitArtifactAttempt({
  context = {},
  executionKey,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  const actor = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_COMMIT_ARTIFACT_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_COMMIT_ARTIFACT_ACTOR_REQUIRED");
  const key = normalizeExecutionKey(executionKey);
  const rowKey = artifactKey(actor, key);
  const loaded = await activeArtifactRow({ organizationId, actor, key });
  if (!loaded?.id) throw new Error("CODE_AI_COMMIT_ARTIFACT_NOT_FOUND");

  const metadata = object(loaded.metadata);
  validateArtifactMetadata(metadata, { key, actor });
  const state = object(metadata.mission_state);
  if (!Object.keys(state).length) throw new Error("CODE_AI_COMMIT_ARTIFACT_STATE_MISSING");
  validateMissionScope(state, { organizationId, actor });

  const now = new Date().toISOString();
  const firstAttemptAt = text(metadata.commit_attempted_at, 100) || now;
  const attemptCount = Math.max(0, Number(metadata.commit_attempt_count || 0)) + 1;
  const updatedMetadata = {
    ...metadata,
    commit_attempted: true,
    commit_attempted_at: firstAttemptAt,
    commit_attempt_last_at: now,
    commit_attempt_count: attemptCount,
    ordinary_memory_recall: false,
    authorization_effect: "NONE",
    commit_requires_separate_governed_capability: true,
  };

  const marked = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata: updatedMetadata, updated_at: now })
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", rowKey)
    .eq("active", true)
    .select("id,updated_at")
    .maybeSingle();

  if (marked.error) throw marked.error;
  if (!marked.data?.id) throw new Error("CODE_AI_COMMIT_ARTIFACT_ATTEMPT_MARK_FAILED");

  return {
    marked: true,
    execution_key: key,
    row_id: marked.data.id,
    commit_attempted: true,
    commit_attempted_at: firstAttemptAt,
    commit_attempt_last_at: now,
    commit_attempt_count: attemptCount,
    updated_at: marked.data.updated_at || now,
  };
}

export async function retireCodeAICommitArtifact({
  context = {},
  executionKey,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  const actor = actorId(context);
  if (!organizationId) throw new Error("CODE_AI_COMMIT_ARTIFACT_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_COMMIT_ARTIFACT_ACTOR_REQUIRED");
  const key = normalizeExecutionKey(executionKey);
  const rowKey = artifactKey(actor, key);

  const retired = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", rowKey)
    .eq("active", true)
    .select("id")
    .maybeSingle();

  if (retired.error) throw retired.error;
  return { retired: Boolean(retired.data?.id) };
}

export const CodeAICommitArtifactRuntime = Object.freeze({
  contract: CODE_AI_COMMIT_ARTIFACT_CONTRACT,
  persist: persistCodeAICommitArtifact,
  load: loadCodeAICommitArtifact,
  markAttempt: markCodeAICommitArtifactAttempt,
  retire: retireCodeAICommitArtifact,
});

export default CodeAICommitArtifactRuntime;
