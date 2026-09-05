import assert from "node:assert/strict";
import fs from "node:fs";

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
const migration = fs.readFileSync(
  "supabase/migrations/20260905065000_atomic_final_knowledge_release.sql",
  "utf8",
);
const route = fs.readFileSync(
  "app/api/intelligence/knowledge/final-release/authorize/route.js",
  "utf8",
);

// Live intelligence_memories compatibility: authorization must use an existing governed memory type.
assert.match(authRuntime, /memory_type: "decision"/);
assert.doesNotMatch(authRuntime, /memory_type: "approval"/);

// Issuer identity is derived from the authenticated session, never accepted from the request surface.
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

// API accepts the approval reason and candidate identity, but not an approver identity override.
assert.match(route, /issueAvantiqoFinalKnowledgeReleaseAuthorization/);
assert.match(route, /organization_id: body\?\.organization_id/);
assert.match(route, /hypothesis_fingerprint: body\?\.hypothesis_fingerprint/);
assert.match(route, /approval_reason: body\?\.approval_reason/);
assert.doesNotMatch(route, /approver_id/);

// App runtime delegates the state transition to one database RPC.
assert.match(atomicRuntime, /\.rpc\("avantiqo_commit_final_knowledge_release"/);
assert.match(atomicRuntime, /p_authorization_expected_updated_at: authorization\.updated_at/);
assert.match(atomicRuntime, /p_candidate_expected_updated_at: candidate\.updated_at/);
assert.match(atomicRuntime, /p_provisional_expected_updated_at: provisional\.updated_at/);
assert.match(atomicRuntime, /receipt\.transaction_atomic !== true/);
assert.match(releaseRuntime, /commitAvantiqoFinalKnowledgeReleaseAtomically/);
assert.match(releaseRuntime, /partial_release_state_allowed: false/);
assert.doesNotMatch(releaseRuntime, /async function consumeFinalReleaseAuthorization/);
assert.doesNotMatch(releaseRuntime, /\.upsert\(row, \{ onConflict: "organization_id,memory_scope,memory_key" \}\)/);
assert.doesNotMatch(releaseRuntime, /FINALIZATION_CONFLICT_RELEASE_QUARANTINED/);

// SQL boundary is invoker-security, service-role only, locks all exact mutable state,
// and raises on every optimistic conflict so Postgres rolls the whole function call back.
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

// Receipt and released row bind back to the same authorization/candidate/claim lineage.
assert.match(atomicRuntime, /candidate_authenticity_mac/);
assert.match(atomicRuntime, /provisional_claim_digest/);
assert.match(atomicRuntime, /approver_staff_account_id/);
assert.match(migration, /authorization_id/);
assert.match(migration, /candidate_authenticity_mac/);
assert.match(migration, /provisional_claim_memory_key/);
assert.match(migration, /provisional_claim_digest/);
assert.match(migration, /final_release_authorization_one_use_consumed/);

console.log("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORITY_ATOMICITY_CERTIFIED");
