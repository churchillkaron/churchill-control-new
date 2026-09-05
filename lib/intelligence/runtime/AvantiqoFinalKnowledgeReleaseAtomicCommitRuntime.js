import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONSUMPTION_SCOPE,
} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";

export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildAvantiqoFinalKnowledgeReleaseAtomicCommit({
  organizationId,
  authorization,
  candidate,
  provisional,
  releaseRow,
  nowIso,
} = {}) {
  const authorizationMetadata = object(authorization?.metadata);
  const candidateMetadata = object(candidate?.metadata);
  const provisionalMetadata = object(provisional?.metadata);
  const authorizationId = text(authorizationMetadata.authorization_id, 128);
  if (!organizationId || !authorization?.id || !candidate?.id || !provisional?.id || !authorizationId) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT}_EXACT_STATE_REQUIRED`);
  }
  if (!authorization.updated_at || !candidate.updated_at || !provisional.updated_at || !releaseRow?.memory_key) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT}_OPTIMISTIC_VERSIONS_REQUIRED`);
  }

  const consumptionMemoryKey = `final-knowledge-release-authorization-consumed:${authorizationId.slice(0, 40)}`;
  const consumptionRow = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONSUMPTION_SCOPE,
    memory_key: consumptionMemoryKey,
    memory_type: "completed_step",
    subject: authorization.subject,
    content: "Signed final knowledge release authorization consumed exactly once by the atomic final-release transaction.",
    importance: 1,
    confidence: 1,
    source: "final_knowledge_release_authorization_consumption",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
      atomic_commit_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT,
      authorization_id: authorizationId,
      authorization_memory_key: authorization.memory_key,
      authorization_signature_key_id: text(authorizationMetadata.release_authorization_signature_key_id, 80) || null,
      hypothesis_fingerprint: text(authorizationMetadata.hypothesis_fingerprint, 128) || null,
      candidate_memory_key: text(candidate.memory_key, 240),
      candidate_authenticity_mac: text(candidateMetadata.final_promotion_candidate_authenticity_mac, 64) || null,
      provisional_claim_memory_key: text(provisional.memory_key, 240),
      provisional_claim_digest: text(candidateMetadata.provisional_claim_digest, 64) || null,
      approver_id: text(authorizationMetadata.approver_id, 160) || null,
      approver_staff_account_id: text(authorizationMetadata.approver_staff_account_id, 80) || null,
      authority_verified: authorizationMetadata.authority_verified === true,
      consumed_at: nowIso,
      one_use_enforced_by_unique_memory_key: true,
      replay_allowed: false,
      automatic_release_allowed: false,
      transaction_atomic: true,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_effect: "FINAL_KNOWLEDGE_RELEASE_ONLY",
    },
    updated_at: nowIso,
  };

  const finalCandidateMetadata = {
    ...candidateMetadata,
    status: "FINAL_KNOWLEDGE_RELEASED",
    production_knowledge_release_authorized: true,
    production_knowledge_release_authorization_contract:
      AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
    production_knowledge_release_authorization_id: authorizationId,
    production_knowledge_release_authorization_consumed: true,
    platform_knowledge_written: true,
    release_memory_key: releaseRow.memory_key,
    release_id: releaseRow.metadata?.release_id || null,
    released_at: nowIso,
    final_release_transaction_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT,
    final_release_transaction_atomic: true,
  };

  const finalProvisionalMetadata = {
    ...provisionalMetadata,
    status: "PROMOTED_TO_EXPLICITLY_RELEASED_PLATFORM_KNOWLEDGE",
    released_knowledge_memory_key: releaseRow.memory_key,
    released_at: nowIso,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    automatic_knowledge_promotion: false,
    final_release_transaction_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT,
    final_release_transaction_atomic: true,
  };

  return {
    authorizationConsumption: {
      authorization_id: authorizationId,
      consumption_memory_key: consumptionMemoryKey,
      approver_id: text(authorizationMetadata.approver_id, 160),
      approval_reason: text(authorizationMetadata.approval_reason, 800),
    },
    consumptionRow,
    candidateMetadata: finalCandidateMetadata,
    provisionalMetadata: finalProvisionalMetadata,
  };
}

export async function commitAvantiqoFinalKnowledgeReleaseAtomically({
  organizationId,
  authorization,
  candidate,
  provisional,
  releaseRow,
  nowIso,
  prepared,
} = {}) {
  const commit = prepared || buildAvantiqoFinalKnowledgeReleaseAtomicCommit({
    organizationId,
    authorization,
    candidate,
    provisional,
    releaseRow,
    nowIso,
  });

  const result = await supabaseAdmin.rpc("avantiqo_commit_final_knowledge_release", {
    p_organization_id: organizationId,
    p_authorization_id: authorization.id,
    p_authorization_memory_key: authorization.memory_key,
    p_authorization_expected_updated_at: authorization.updated_at,
    p_candidate_id: candidate.id,
    p_candidate_expected_updated_at: candidate.updated_at,
    p_provisional_id: provisional.id,
    p_provisional_expected_updated_at: provisional.updated_at,
    p_consumption_row: commit.consumptionRow,
    p_release_row: releaseRow,
    p_candidate_metadata: commit.candidateMetadata,
    p_provisional_metadata: commit.provisionalMetadata,
    p_committed_at: nowIso,
  });
  if (result.error) throw result.error;
  const receipt = object(result.data);
  if (
    receipt.success !== true ||
    receipt.contract !== AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT ||
    receipt.transaction_atomic !== true ||
    receipt.authorization_consumed !== true ||
    receipt.candidate_finalized !== true ||
    receipt.provisional_superseded !== true ||
    text(receipt.release_memory_key, 240) !== text(releaseRow.memory_key, 240)
  ) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT}_INVALID_DATABASE_RECEIPT`);
  }
  return { ...commit, receipt };
}

export default Object.freeze({
  contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT,
  build: buildAvantiqoFinalKnowledgeReleaseAtomicCommit,
  commit: commitAvantiqoFinalKnowledgeReleaseAtomically,
});
