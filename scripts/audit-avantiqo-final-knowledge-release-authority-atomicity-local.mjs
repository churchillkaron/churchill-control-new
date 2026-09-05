import assert from "node:assert/strict";
import fs from "node:fs";
import "./audit-avantiqo-final-knowledge-release-immutable-receipt-local.mjs";

const authRuntime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js",
  "utf8",
);
const issuerRuntime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAuthorizationIssuerRuntime.js",
  "utf8",
);
const atomicRuntime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js",
  "utf8",
);
const releaseRuntime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js",
  "utf8",
);
const hybridRuntime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20260905065000_atomic_final_knowledge_release.sql",
  "utf8",
);
const route = fs.readFileSync(
  "app/api/intelligence/knowledge/final-release/authorize/route.js",
  "utf8",
);

assert.equal(fs.existsSync("scripts/apply-final-knowledge-release-immutable-receipt-p3.py"), false);
assert.equal(fs.existsSync("scripts/patch-final-knowledge-release-immutable-receipt.py"), false);
assert.equal(fs.existsSync("scripts/fix-final-knowledge-release-stale-approval-export.py"), false);
assert.equal(fs.existsSync(".github/workflows/avantiqo-fix-stale-release-approval-export.yml"), false);
assert.equal(fs.existsSync("scripts/certify-avantiqo-final-knowledge-release-postgres-local.mjs"), true);

assert.match(authRuntime, /memory_type: "decision"/);
assert.doesNotMatch(authRuntime, /memory_type: "approval"/);

assert.match(issuerRuntime, /getServerCurrentUser\(\)/);
assert.match(issuerRuntime, /\.rpc\("can_manage_organization"/);
assert.match(issuerRuntime, /target_organization_id: organizationId/);
assert.match(issuerRuntime, /auth_user_id/);
assert.match(issuerRuntime, /staff_account_id/);
assert.match(issuerRuntime, /caller_supplied_approver_identity_allowed: false/);
assert.match(issuerRuntime, /approver_id: `staff:\$\{actor\.staff_account_id\}`/);
assert.doesNotMatch(
  issuerRuntime.match(/export async function issueAvantiqoFinalKnowledgeReleaseAuthorization\([\s\S]*?\} = \{\}\)/)?.[0] || "",
  /approver_id/,
);
assert.match(issuerRuntime, /createAvantiqoFinalPromotionCandidateAuthenticityVerifier/);
assert.match(issuerRuntime, /verifyAvantiqoFinalPromotionCandidateClaimBinding/);
assert.match(issuerRuntime, /authority_verified: true/);

assert.match(route, /issueAvantiqoFinalKnowledgeReleaseAuthorization/);
assert.match(route, /organization_id: body\?\.organization_id/);
assert.match(route, /hypothesis_fingerprint: body\?\.hypothesis_fingerprint/);
assert.match(route, /approval_reason: body\?\.approval_reason/);
assert.doesNotMatch(route, /approver_id/);

const releaseFunctionStart = releaseRuntime.indexOf("export async function releaseAvantiqoFinalKnowledge");
const releaseFunctionEnd = releaseRuntime.indexOf("\nasync function loadReleasedKnowledge", releaseFunctionStart);
assert.ok(releaseFunctionStart >= 0 && releaseFunctionEnd > releaseFunctionStart);
const releaseFunction = releaseRuntime.slice(releaseFunctionStart, releaseFunctionEnd);
assert.match(atomicRuntime, /\.rpc\("avantiqo_commit_final_knowledge_release"/);
assert.match(atomicRuntime, /p_authorization_expected_updated_at: authorization\.updated_at/);
assert.match(atomicRuntime, /p_candidate_expected_updated_at: candidate\.updated_at/);
assert.match(atomicRuntime, /p_provisional_expected_updated_at: provisional\.updated_at/);
assert.match(atomicRuntime, /receipt\.transaction_atomic !== true/);
assert.match(releaseFunction, /commitAvantiqoFinalKnowledgeReleaseAtomically/);
assert.match(releaseFunction, /partial_release_state_allowed: false/);
assert.doesNotMatch(releaseRuntime, /async function consumeFinalReleaseAuthorization/);
assert.doesNotMatch(releaseFunction, /\.upsert\(row, \{ onConflict: "organization_id,memory_scope,memory_key" \}\)/);
assert.doesNotMatch(releaseFunction, /FINALIZATION_CONFLICT_RELEASE_QUARANTINED/);
assert.match(releaseRuntime, /async function writeEvent/);
assert.match(releaseRuntime, /\.upsert\(row, \{ onConflict: "organization_id,memory_scope,memory_key" \}\)/);

assert.match(migration, /language plpgsql\s+security invoker/i);
assert.doesNotMatch(migration, /security definer/i);
assert.match(migration, /set search_path = public/i);
assert.match(migration, /revoke all on function public\.avantiqo_commit_final_knowledge_release[\s\S]*from public, anon, authenticated;/i);
assert.match(migration, /grant execute on function public\.avantiqo_commit_final_knowledge_release[\s\S]*to service_role;/i);
assert.match(migration, /memory_scope = 'platform_learning_knowledge_release_authorizations'[\s\S]*for update;/i);
assert.match(migration, /memory_scope = 'platform_learning_knowledge_final_promotion_candidates'[\s\S]*for update;/i);
assert.match(migration, /memory_scope = 'platform_provisional_knowledge'[\s\S]*for update;/i);
assert.match(migration, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_STATE_CONFLICT/);
assert.match(migration, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CANDIDATE_STATE_CONFLICT/);
assert.match(migration, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_PROVISIONAL_STATE_CONFLICT/);
assert.match(migration, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_CONSUME_CONFLICT/);
assert.match(migration, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CANDIDATE_FINALIZE_CONFLICT/);
assert.match(migration, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_PROVISIONAL_FINALIZE_CONFLICT/);
assert.match(migration, /insert into public\.intelligence_memories[\s\S]*v_consumption_memory_key/);
assert.match(migration, /insert into public\.intelligence_memories[\s\S]*v_release_memory_key/);
assert.match(migration, /'transaction_atomic', true/);
assert.match(migration, /nullif\(v_receipt_metadata->>'committed_at', ''\) is null/);
assert.match(migration, /released_knowledge_binding_digest', ''\) !~ '\^\[0-9a-f\]\{64\}\$'/);
assert.doesNotMatch(migration, /length\(coalesce\(v_receipt_metadata->>'released_knowledge_binding_digest'/);

assert.match(atomicRuntime, /candidate_authenticity_mac/);
assert.match(atomicRuntime, /provisional_claim_digest/);
assert.match(atomicRuntime, /approver_staff_account_id/);
assert.match(migration, /authorization_id/);
assert.match(migration, /candidate_authenticity_mac/);
assert.match(migration, /provisional_claim_memory_key/);
assert.match(migration, /provisional_claim_digest/);
assert.match(migration, /final_release_authorization_one_use_consumed/);
assert.match(migration, /platform_learning_knowledge_release_receipts/);
assert.match(migration, /AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ATOMIC_BINDING_V1/);
assert.match(migration, /trg_avantiqo_final_knowledge_release_receipt_immutable/);

assert.match(hybridRuntime, /createAvantiqoFinalKnowledgeReleaseReceiptIdentity/);
assert.match(hybridRuntime, /const RECEIPT_LOOKUP_BATCH_SIZE = 100/);
assert.match(hybridRuntime, /function receiptMemoryKeysForReleaseRows/);
assert.match(hybridRuntime, /async function loadExactReleaseReceipts/);
assert.match(hybridRuntime, /\.in\("memory_key", batch\)/);
assert.match(hybridRuntime, /receipt_history_global_limit_dependency_removed: true/);
assert.match(hybridRuntime, /receipt_lookup_scales_with_candidate_releases_not_receipt_history: true/);
assert.doesNotMatch(
  hybridRuntime,
  /memory_scope", AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE\)[\s\S]{0,220}\.limit\(MAX_CANDIDATES\)/,
);

if (process.env.CI === "true") {
  await import("./certify-avantiqo-final-knowledge-release-postgres-local.mjs");
}

console.log("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORITY_ATOMICITY_CERTIFIED");