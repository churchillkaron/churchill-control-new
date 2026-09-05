import assert from "node:assert/strict";
import fs from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
  createAvantiqoFinalKnowledgeReleaseAuthorizationDraft,
  sealAvantiqoFinalKnowledgeReleaseAuthorization,
  createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier,
  verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding,
} from "../lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";
import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateClaimBinding,
} from "../lib/intelligence/runtime/AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";

function keyMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicB64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    privateB64: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  };
}

function envFor(keys, active = "release-v1") {
  return {
    AVANTIQO_KNOWLEDGE_RELEASE_AUTH_ACTIVE_KEY_ID: active,
    AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PRIVATE_KEY_PKCS8_B64: keys[active]?.privateB64 || "",
    AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PUBLIC_KEYRING_JSON: JSON.stringify(
      Object.fromEntries(Object.entries(keys).map(([keyId, value]) => [keyId, value.publicB64])),
    ),
  };
}

const organizationId = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const hypothesis = "a".repeat(64);
const nowIso = "2026-09-05T06:00:00.000Z";
const provisional = {
  id: "provisional-1",
  organization_id: organizationId,
  memory_scope: "platform_provisional_knowledge",
  memory_key: "provisional:mechanism-a",
  subject: "knowledge:mechanism-a",
  content: "A governed mechanism improves the measured business outcome under the certified boundary conditions.",
  active: true,
  valid_until: "2026-10-05T06:00:00.000Z",
  metadata: {
    hypothesis_fingerprint: hypothesis,
    synthesis_fingerprint: "b".repeat(64),
    epistemic_state: "PROVISIONAL_NOT_CANONICAL",
    status: "PROVISIONAL_SHADOW_ONLY",
  },
  updated_at: nowIso,
};
const binding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);
assert.equal(binding.success, true);

const candidate = {
  id: "candidate-1",
  organization_id: organizationId,
  memory_scope: "platform_learning_knowledge_final_promotion_candidates",
  memory_key: `knowledge-final-promotion:${hypothesis.slice(0, 40)}`,
  source: "counterfactual_knowledge_final_promotion_gate",
  active: true,
  metadata: {
    hypothesis_fingerprint: hypothesis,
    evaluation_fingerprint: "c".repeat(64),
    final_promotion_candidate_authenticity_contract:
      AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
    final_promotion_candidate_authenticity_key_id: "candidate-v1",
    final_promotion_candidate_authenticity_mac: "d".repeat(64),
    provisional_claim_binding_contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
    provisional_claim_memory_key: binding.binding.provisional_claim_memory_key,
    provisional_claim_updated_at: binding.binding.provisional_claim_updated_at,
    provisional_claim_digest: binding.binding.provisional_claim_digest,
  },
};

const releaseV1 = keyMaterial();
const releaseV2 = keyMaterial();
const keys = { "release-v1": releaseV1, "release-v2": releaseV2 };
const signingEnv = envFor(keys, "release-v1");
const draft = createAvantiqoFinalKnowledgeReleaseAuthorizationDraft({
  organization_id: organizationId,
  candidate,
  provisional,
  approver_id: "operator:patric",
  approval_reason: "Explicitly approve this exact evidence-backed candidate for final release.",
  expires_in_minutes: 30,
  now: new Date(nowIso),
  nonce: "release-auth-nonce-00000001",
});
assert.equal(draft.success, true);
assert.equal(draft.row.metadata.contract, AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT);
assert.equal(draft.row.metadata.one_use_required, true);
assert.equal(draft.row.metadata.automatic_issuance_allowed, false);
assert.equal(draft.row.metadata.automatic_release_allowed, false);
assert.equal(draft.row.metadata.unsigned_compatibility_allowed, false);

const sealed = sealAvantiqoFinalKnowledgeReleaseAuthorization(draft.row, { env: signingEnv });
assert.equal(sealed.success, true);
const verificationEnv = {
  AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PUBLIC_KEYRING_JSON: signingEnv.AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PUBLIC_KEYRING_JSON,
};
const verifier = createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier({
  env: verificationEnv,
  now: () => Date.parse("2026-09-05T06:10:00.000Z"),
});
assert.equal(verifier.available, true);
assert.equal(verifier.verify(sealed.row), true);
assert.equal(verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding(sealed.row, candidate, provisional), true);
assert.equal("AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PRIVATE_KEY_PKCS8_B64" in verificationEnv, false);

function tampered(mutator) {
  const copy = structuredClone(sealed.row);
  mutator(copy);
  assert.equal(verifier.verify(copy), false);
}

tampered((row) => { row.organization_id = "different-org"; });
tampered((row) => { row.memory_key += "-forged"; });
tampered((row) => { row.valid_until = "2026-09-06T06:30:00.000Z"; });
tampered((row) => { row.metadata.approver_id = "operator:attacker"; });
tampered((row) => { row.metadata.approval_reason = "different reason"; });
tampered((row) => { row.metadata.hypothesis_fingerprint = "e".repeat(64); });
tampered((row) => { row.metadata.candidate_memory_key = "knowledge-final-promotion:other"; });
tampered((row) => { row.metadata.candidate_authenticity_mac = "f".repeat(64); });
tampered((row) => { row.metadata.provisional_claim_digest = "1".repeat(64); });
tampered((row) => { row.metadata.nonce = "release-auth-nonce-forged"; });
tampered((row) => { row.metadata.status = "CONSUMED"; });
tampered((row) => { row.metadata.release_authorization_signature = "A".repeat(86); });

const unsigned = structuredClone(sealed.row);
delete unsigned.metadata.release_authorization_signature;
assert.equal(verifier.verify(unsigned), false);

const expiredVerifier = createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier({
  env: verificationEnv,
  now: () => Date.parse("2026-09-05T07:00:01.000Z"),
});
assert.equal(expiredVerifier.verify(sealed.row), false);

const wrongCandidate = structuredClone(candidate);
wrongCandidate.memory_key = "knowledge-final-promotion:wrong-candidate";
assert.equal(verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding(sealed.row, wrongCandidate, provisional), false);
const wrongCandidateMac = structuredClone(candidate);
wrongCandidateMac.metadata.final_promotion_candidate_authenticity_mac = "2".repeat(64);
assert.equal(verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding(sealed.row, wrongCandidateMac, provisional), false);
const driftedProvisional = structuredClone(provisional);
driftedProvisional.content += " Changed after authorization.";
driftedProvisional.updated_at = "2026-09-05T06:12:00.000Z";
assert.equal(verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding(sealed.row, candidate, driftedProvisional), false);

const rotatedEnv = envFor(keys, "release-v2");
const rotatedVerifier = createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier({
  env: { AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PUBLIC_KEYRING_JSON: rotatedEnv.AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PUBLIC_KEYRING_JSON },
  now: () => Date.parse("2026-09-05T06:10:00.000Z"),
});
assert.equal(rotatedVerifier.verify(sealed.row), true);
const rotatedDraft = createAvantiqoFinalKnowledgeReleaseAuthorizationDraft({
  organization_id: organizationId,
  candidate,
  provisional,
  approver_id: "operator:patric",
  approval_reason: "Second explicit approval for rotation certification only.",
  now: new Date(nowIso),
  nonce: "release-auth-nonce-00000002",
});
const rotatedSeal = sealAvantiqoFinalKnowledgeReleaseAuthorization(rotatedDraft.row, { env: rotatedEnv });
assert.equal(rotatedSeal.success, true);
assert.equal(rotatedSeal.key_id, "release-v2");

const retiredVerifier = createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier({
  env: { AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PUBLIC_KEYRING_JSON: JSON.stringify({ "release-v2": releaseV2.publicB64 }) },
  now: () => Date.parse("2026-09-05T06:10:00.000Z"),
});
assert.equal(retiredVerifier.verify(sealed.row), false);
assert.equal(retiredVerifier.verify(rotatedSeal.row), true);

const releaseSource = fs.readFileSync("lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js", "utf8");
assert.equal(releaseSource.includes("AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED"), false);
assert.match(releaseSource, /authorization_memory_key/);
assert.match(releaseSource, /createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier\(\)/);
assert.match(releaseSource, /authorizationVerifier\.verify\(authorization\)/);
assert.match(releaseSource, /verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding/);
assert.match(releaseSource, /SIGNED_RELEASE_AUTHORIZATION_INVALID_OR_EXPIRED/);
assert.match(releaseSource, /SIGNED_RELEASE_AUTHORIZATION_BINDING_MISMATCH/);
assert.match(releaseSource, /SIGNED_RELEASE_AUTHORIZATION_ALREADY_CONSUMED/);
assert.match(releaseSource, /\.insert\(consumptionRow\)/);
assert.match(releaseSource, /final-knowledge-release-authorization-consumed:/);
assert.match(releaseSource, /release_authorization_one_use_consumed: true/);
assert.match(releaseSource, /global_release_approval_switch_sufficient: false/);

console.log("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CERTIFIED");
