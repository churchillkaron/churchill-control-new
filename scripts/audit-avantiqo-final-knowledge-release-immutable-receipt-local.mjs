import assert from "node:assert/strict";
import fs from "node:fs";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateClaimBinding,
} from "../lib/intelligence/runtime/AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
} from "../lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";
import {
  AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
} from "../lib/intelligence/runtime/AvantiqoReleasedKnowledgeAuthenticityRuntime.js";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,
  createAvantiqoFinalKnowledgeReleaseBindingDigest,
  createAvantiqoFinalKnowledgeReleaseReceiptDraft,
  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,
  sealAvantiqoFinalKnowledgeReleaseReceipt,
  verifyAvantiqoFinalKnowledgeReleaseReceiptBinding,
  verifyAvantiqoFinalKnowledgeReleaseReceiptLineage,
} from "../lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js";

function clone(value) {
  return structuredClone(value);
}

function signerEnv(keyId = "receipt-v1") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    AVANTIQO_KNOWLEDGE_RELEASE_RECEIPT_ACTIVE_KEY_ID: keyId,
    AVANTIQO_KNOWLEDGE_RELEASE_RECEIPT_PRIVATE_KEY_PKCS8_B64: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    AVANTIQO_KNOWLEDGE_RELEASE_RECEIPT_PUBLIC_KEYRING_JSON: JSON.stringify({
      [keyId]: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    }),
  };
}

const organizationId = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const candidateId = randomUUID();
const provisionalId = randomUUID();
const consumptionRowId = randomUUID();
const releaseRowId = randomUUID();
const receiptRowId = randomUUID();
const transactionId = randomUUID();
const nowIso = "2026-09-05T08:00:00.000Z";
const hypothesis = "1".repeat(64);
const authorizationId = "2".repeat(64);
const candidateMac = "3".repeat(64);
const releaseMac = "4".repeat(64);
const releaseId = "5".repeat(64);

const provisional = {
  id: provisionalId,
  organization_id: organizationId,
  memory_scope: "platform_provisional_knowledge",
  memory_key: `provisional:${hypothesis.slice(0, 40)}`,
  memory_type: "fact",
  subject: "knowledge:test",
  content: "A governed synthetic claim used only to certify immutable release receipt lineage.",
  active: true,
  valid_until: null,
  updated_at: "2026-09-05T07:58:00.000Z",
  metadata: {
    hypothesis_fingerprint: hypothesis,
    synthesis_fingerprint: "6".repeat(64),
    status: "PROVISIONAL_SHADOW_ONLY",
    epistemic_state: "PROVISIONAL_NOT_CANONICAL",
  },
};
const claimBinding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);
assert.equal(claimBinding.success, true);

const candidate = {
  id: candidateId,
  organization_id: organizationId,
  memory_scope: "platform_learning_knowledge_final_promotion_candidates",
  memory_key: `final-promotion-candidate:${hypothesis.slice(0, 40)}`,
  memory_type: "decision",
  subject: "candidate:test",
  content: "Synthetic final promotion candidate.",
  active: true,
  updated_at: "2026-09-05T07:59:00.000Z",
  metadata: {
    hypothesis_fingerprint: hypothesis,
    final_promotion_candidate_authenticity_contract:
      AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
    final_promotion_candidate_authenticity_key_id: "candidate-key",
    final_promotion_candidate_authenticity_mac: candidateMac,
    provisional_claim_binding_contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
    provisional_claim_memory_key: claimBinding.binding.provisional_claim_memory_key,
    provisional_claim_updated_at: claimBinding.binding.provisional_claim_updated_at,
    provisional_claim_digest: claimBinding.binding.provisional_claim_digest,
  },
};

const authorization = {
  id: randomUUID(),
  organization_id: organizationId,
  memory_scope: "platform_learning_knowledge_release_authorizations",
  memory_key: `final-knowledge-release-authorization:${authorizationId.slice(0, 40)}`,
  memory_type: "decision",
  subject: "authorization:test",
  content: "Synthetic signed release authorization.",
  active: true,
  valid_until: "2026-09-05T09:00:00.000Z",
  updated_at: "2026-09-05T07:59:30.000Z",
  metadata: {
    contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
    status: "READY",
    authorization_id: authorizationId,
    hypothesis_fingerprint: hypothesis,
    candidate_memory_key: candidate.memory_key,
    candidate_authenticity_mac: candidateMac,
    provisional_claim_memory_key: provisional.memory_key,
    provisional_claim_digest: claimBinding.binding.provisional_claim_digest,
    approver_id: `staff:${randomUUID()}`,
    approver_staff_account_id: randomUUID(),
    approver_auth_user_id: randomUUID(),
    approver_role_at_issue: "OWNER",
    authority_function: "public.can_manage_organization(uuid)",
    authority_verified: true,
    authority_verified_at: "2026-09-05T07:59:29.000Z",
    release_authorization_signature_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
    release_authorization_signature_algorithm: "Ed25519",
    release_authorization_signature_key_id: "authorization-v1",
    release_authorization_signature: "A".repeat(86),
  },
};

const releaseRow = {
  id: releaseRowId,
  organization_id: organizationId,
  party_id: null,
  entity_id: null,
  conversation_id: null,
  source_turn_id: null,
  memory_scope: "platform_knowledge",
  memory_key: `released-knowledge:${hypothesis.slice(0, 40)}`,
  memory_type: "fact",
  subject: "knowledge:test",
  content: provisional.content,
  importance: 0.96,
  confidence: 0.91,
  source: "avantiqo_explicit_final_knowledge_release",
  active: true,
  valid_until: "2026-12-04T08:00:00.000Z",
  superseded_by: null,
  superseded_at: null,
  forgotten_at: null,
  metadata: {
    contract: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_V1",
    release_id: releaseId,
    release_status: "RELEASED_MONITORED",
    hypothesis_fingerprint: hypothesis,
    final_release_authorization_id: authorizationId,
    final_release_authorization_one_use_consumed: true,
    final_promotion_candidate_authenticity_contract:
      AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
    final_promotion_candidate_authenticity_key_id: "candidate-key",
    final_promotion_candidate_authenticity_mac: candidateMac,
    provisional_claim_memory_key: provisional.memory_key,
    provisional_claim_digest: claimBinding.binding.provisional_claim_digest,
    evidence_graph_memory_key: "evidence:test",
    released_knowledge_authenticity_contract:
      AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
    released_knowledge_authenticity_key_id: "released-v1",
    released_knowledge_authenticity_mac: releaseMac,
    reusable_platform_knowledge: true,
    knowledge_router_reuse_allowed: true,
  },
  updated_at: nowIso,
};

const binding = createAvantiqoFinalKnowledgeReleaseBindingDigest(releaseRow);
assert.equal(binding.success, true);
releaseRow.metadata.final_release_binding_digest = binding.digest;

const env = signerEnv();
const draft = createAvantiqoFinalKnowledgeReleaseReceiptDraft({
  organization_id: organizationId,
  authorization,
  candidate,
  provisional,
  release_row: releaseRow,
  consumption_memory_key: `final-knowledge-release-authorization-consumed:${authorizationId.slice(0, 40)}`,
  consumption_row_id: consumptionRowId,
  release_row_id: releaseRowId,
  receipt_row_id: receiptRowId,
  transaction_id: transactionId,
  committed_at: nowIso,
});
assert.equal(draft.success, true);
assert.equal(draft.row.id, receiptRowId);
assert.equal(draft.row.memory_scope, AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE);
assert.equal(draft.row.metadata.contract, AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT);
assert.equal(draft.row.metadata.consumption_row_id, consumptionRowId);
assert.equal(draft.row.metadata.release_row_id, releaseRowId);
assert.equal(draft.row.metadata.receipt_row_id, receiptRowId);
assert.equal(draft.row.metadata.released_knowledge_binding_digest, binding.digest);

const sealed = sealAvantiqoFinalKnowledgeReleaseReceipt(draft.row, { env });
assert.equal(sealed.success, true);
const verifier = createAvantiqoFinalKnowledgeReleaseReceiptVerifier({ env: {
  AVANTIQO_KNOWLEDGE_RELEASE_RECEIPT_PUBLIC_KEYRING_JSON:
    env.AVANTIQO_KNOWLEDGE_RELEASE_RECEIPT_PUBLIC_KEYRING_JSON,
} });
assert.equal(verifier.available, true);
assert.equal(verifier.verify(sealed.row), true);
assert.equal(verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(sealed.row, releaseRow), true);
assert.equal(verifyAvantiqoFinalKnowledgeReleaseReceiptLineage(sealed.row, {
  authorization,
  candidate,
  provisional,
  releaseRow,
}), true);

const tamperCases = [
  (row) => { row.id = randomUUID(); },
  (row) => { row.metadata.receipt_row_id = randomUUID(); },
  (row) => { row.metadata.release_row_id = randomUUID(); },
  (row) => { row.metadata.consumption_row_id = randomUUID(); },
  (row) => { row.metadata.transaction_id = randomUUID(); },
  (row) => { row.metadata.authorization_id = "f".repeat(64); },
  (row) => { row.metadata.authorization_signature = "B".repeat(86); },
  (row) => { row.metadata.candidate_authenticity_mac = "a".repeat(64); },
  (row) => { row.metadata.provisional_claim_digest = "b".repeat(64); },
  (row) => { row.metadata.released_knowledge_binding_digest = "c".repeat(64); },
  (row) => { row.metadata.released_knowledge_authenticity_mac_at_release = "d".repeat(64); },
  (row) => { row.metadata.committed_at = "2026-09-05T08:01:00.000Z"; },
  (row) => { row.content += " tampered"; },
  (row) => { row.metadata.release_receipt_signature_key_id = "retired"; },
  (row) => { row.metadata.release_receipt_signature = "Z".repeat(86); },
];
for (const mutate of tamperCases) {
  const copy = clone(sealed.row);
  mutate(copy);
  assert.equal(verifier.verify(copy), false);
}

for (const mutate of [
  (row) => { row.id = randomUUID(); },
  (row) => { row.content += " substituted"; },
  (row) => { row.metadata.final_release_authorization_id = "e".repeat(64); },
  (row) => { row.metadata.provisional_claim_digest = "f".repeat(64); },
  (row) => { row.metadata.final_promotion_candidate_authenticity_mac = "a".repeat(64); },
  (row) => { row.memory_key += ":other"; },
]) {
  const copy = clone(releaseRow);
  mutate(copy);
  assert.equal(verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(sealed.row, copy), false);
}

const atomicRuntime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js",
  "utf8",
);
const releaseRuntime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js",
  "utf8",
);
const retrievalRuntime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20260905065000_atomic_final_knowledge_release.sql",
  "utf8",
);

assert.match(atomicRuntime, /const consumptionRowId = randomUUID\(\)/);
assert.match(atomicRuntime, /const releaseRowId = randomUUID\(\)/);
assert.match(atomicRuntime, /const receiptRowId = randomUUID\(\)/);
assert.match(atomicRuntime, /p_receipt_row: receiptSeal\.row/);
assert.match(atomicRuntime, /p_transaction_id: transactionId/);
assert.match(atomicRuntime, /receipt\.release_receipt_persisted !== true/);
assert.match(releaseRuntime, /final_release_receipt_required: true/);
assert.match(releaseRuntime, /final_release_binding_digest: releaseBinding\.digest/);
assert.match(releaseRuntime, /loadFinalReleaseReceiptForRelease/);
assert.doesNotMatch(releaseRuntime, /RELEASE_APPROVAL_ENV/);
assert.match(retrievalRuntime, /verifyAvantiqoFinalKnowledgeReleaseReceiptBinding/);
assert.match(retrievalRuntime, /IMMUTABLE_FINAL_RELEASE_RECEIPT_VERIFICATION_REQUIRED/);
assert.match(retrievalRuntime, /receipt_deletion_or_tamper_blocks_reuse: true/);

assert.match(migration, /p_receipt_row jsonb/);
assert.match(migration, /p_transaction_id uuid/);
assert.match(migration, /v_consumption_id := nullif\(p_consumption_row->>'id', ''\)::uuid/);
assert.match(migration, /v_release_id := nullif\(p_release_row->>'id', ''\)::uuid/);
assert.match(migration, /v_receipt_id := nullif\(p_receipt_row->>'id', ''\)::uuid/);
assert.match(migration, /platform_learning_knowledge_release_receipts/);
assert.match(migration, /released_knowledge_binding_digest/);
assert.match(migration, /release_receipt_persisted', true/);
assert.match(migration, /trg_avantiqo_final_knowledge_release_receipt_immutable/);
assert.match(migration, /before update or delete on public\.intelligence_memories/i);
assert.match(migration, /security invoker/i);
assert.doesNotMatch(migration, /security definer/i);
assert.match(migration, /grant execute on function public\.avantiqo_commit_final_knowledge_release[\s\S]*to service_role;/i);
assert.match(migration, /revoke all on function public\.avantiqo_commit_final_knowledge_release[\s\S]*from public, anon, authenticated;/i);

console.log("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_IMMUTABLE_RECEIPT_CERTIFIED");
