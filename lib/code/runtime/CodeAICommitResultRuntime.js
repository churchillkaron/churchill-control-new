import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadCodeAICommitArtifact } from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import { validateCodeAICommitResultBinding } from "@/lib/code/runtime/CodeAICommitResultPolicyRuntime.mjs";

export const CODE_AI_COMMIT_RESULT_CONTRACT =
  "AVANTIQO_CODE_AI_COMMIT_RESULT_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_commit_artifact";
const ARTIFACT_CONTRACT = "AVANTIQO_CODE_AI_COMMIT_ARTIFACT_V1";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160);
}

async function readArtifactMetadata({ context, artifact }) {
  const orgId = organizationId(context);
  const loaded = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("id", artifact.row_id)
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("active", true)
    .maybeSingle();

  if (loaded.error) throw loaded.error;
  if (!loaded.data?.id) throw new Error("CODE_AI_COMMIT_RESULT_ARTIFACT_NOT_FOUND");

  const metadata = object(loaded.data.metadata);
  if (
    text(metadata.contract, 160) !== ARTIFACT_CONTRACT ||
    text(metadata.execution_key, 160) !== text(artifact.execution_key, 160) ||
    metadata.commit_attempted !== true
  ) {
    throw new Error("CODE_AI_COMMIT_RESULT_ARTIFACT_SCOPE_MISMATCH");
  }

  return {
    row: loaded.data,
    metadata,
  };
}

export async function recordCodeAICommitResult({
  context = {},
  executionKey,
  commitSha,
  repositoryUrl,
  ref,
} = {}) {
  const artifact = await loadCodeAICommitArtifact({ context, executionKey });
  const current = await readArtifactMetadata({ context, artifact });
  const existingCommitSha = text(current.metadata.committed_sha, 80) || null;
  const proof = validateCodeAICommitResultBinding({
    artifact,
    commitSha,
    existingCommitSha,
  });

  if (proof.idempotent) {
    return {
      recorded: true,
      idempotent: true,
      contract: CODE_AI_COMMIT_RESULT_CONTRACT,
      execution_key: proof.execution_key,
      row_id: proof.row_id,
      committed_sha: proof.committed_sha,
      commit_result_recorded_at:
        text(current.metadata.commit_result_recorded_at, 100) || null,
      authorization_effect: "NONE",
    };
  }

  const now = new Date().toISOString();
  const updatedMetadata = {
    ...current.metadata,
    committed_sha: proof.committed_sha,
    commit_result_recorded_at: now,
    commit_result_source: "SERVER_GOVERNED_COMMIT_RESPONSE",
    commit_result_repository_url: text(repositoryUrl, 500) || null,
    commit_result_ref: text(ref, 160) || null,
    ordinary_memory_recall: false,
    authorization_effect: "NONE",
    deploy_authority: false,
    production_routing_authority: false,
  };

  const updated = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata: updatedMetadata, updated_at: now })
    .eq("id", current.row.id)
    .eq("organization_id", organizationId(context))
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("active", true)
    .eq("updated_at", current.row.updated_at)
    .select("id,updated_at")
    .maybeSingle();

  if (updated.error) throw updated.error;
  if (!updated.data?.id) {
    const latestArtifact = await loadCodeAICommitArtifact({ context, executionKey });
    const latest = await readArtifactMetadata({ context, artifact: latestArtifact });
    const latestProof = validateCodeAICommitResultBinding({
      artifact: latestArtifact,
      commitSha,
      existingCommitSha: text(latest.metadata.committed_sha, 80) || null,
    });
    if (!latestProof.idempotent) {
      throw new Error("CODE_AI_COMMIT_RESULT_CONCURRENT_WRITE");
    }
    return {
      recorded: true,
      idempotent: true,
      contract: CODE_AI_COMMIT_RESULT_CONTRACT,
      execution_key: latestProof.execution_key,
      row_id: latestProof.row_id,
      committed_sha: latestProof.committed_sha,
      commit_result_recorded_at:
        text(latest.metadata.commit_result_recorded_at, 100) || null,
      authorization_effect: "NONE",
    };
  }

  return {
    recorded: true,
    idempotent: false,
    contract: CODE_AI_COMMIT_RESULT_CONTRACT,
    execution_key: proof.execution_key,
    row_id: proof.row_id,
    committed_sha: proof.committed_sha,
    commit_result_recorded_at: updated.data.updated_at || now,
    authorization_effect: "NONE",
  };
}

export const CodeAICommitResultRuntime = Object.freeze({
  contract: CODE_AI_COMMIT_RESULT_CONTRACT,
  record: recordCodeAICommitResult,
  server_owned_commit_result_required: true,
  immutable_result: true,
  authorization_effect: "NONE",
});

export default CodeAICommitResultRuntime;
