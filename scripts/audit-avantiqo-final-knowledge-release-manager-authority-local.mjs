import assert from "node:assert/strict";
import fs from "node:fs";

const authority = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseManagerAuthorityRuntime.js",
  "utf8",
);
const issuer = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAuthorizationIssuerRuntime.js",
  "utf8",
);
const readiness = fs.readFileSync(
  "app/api/intelligence/knowledge/final-release/readiness/route.js",
  "utf8",
);

assert.match(authority, /getServerCurrentUser\(\)/);
assert.match(authority, /\.rpc\("can_manage_organization"/);
assert.match(authority, /target_organization_id: organizationId/);
assert.match(authority, /\.from\("staff_accounts"\)/);
assert.match(authority, /\.eq\("auth_user_id", authUserId\)/);
assert.match(authority, /\.eq\("active", true\)/);
assert.match(authority, /\.from\("organization_users"\)/);
assert.match(authority, /\.eq\("organization_id", organizationId\)/);
assert.match(authority, /\.eq\("status", "active"\)/);
assert.match(authority, /\.in\("staff_account_id", staffIds\)/);
assert.doesNotMatch(authority, /\.limit\(100\)/);
assert.match(authority, /MANAGER_ROLES\.has\(role\)/);
assert.match(authority, /AUTHORITY_EVIDENCE_MISMATCH/);
assert.match(authority, /caller_supplied_identity_allowed: false/);
assert.match(authority, /staff_account_active_verified: true/);
assert.match(authority, /organization_membership_active_verified: true/);
assert.match(authority, /manager_role_verified: true/);

assert.match(issuer, /assertAvantiqoFinalKnowledgeReleaseManagerAuthority/);
assert.doesNotMatch(issuer, /getServerCurrentUser/);
assert.doesNotMatch(issuer, /createServerClient/);
assert.doesNotMatch(issuer, /\.rpc\("can_manage_organization"/);
assert.doesNotMatch(issuer, /\.from\("organization_users"\)/);
assert.match(issuer, /authority_contract: actor\.contract/);
assert.match(issuer, /organization_membership_active_verified: actor\.organization_membership_active_verified/);
assert.match(issuer, /manager_role_verified: actor\.manager_role_verified/);

assert.match(readiness, /assertAvantiqoFinalKnowledgeReleaseManagerAuthority/);
assert.doesNotMatch(readiness, /getServerCurrentUser/);
assert.doesNotMatch(readiness, /createServerClient/);
assert.doesNotMatch(readiness, /\.rpc\("can_manage_organization"/);
assert.match(readiness, /staff_account_active_verified: actor\.staff_account_active_verified/);
assert.match(readiness, /organization_membership_active_verified: actor\.organization_membership_active_verified/);
assert.match(readiness, /manager_role_verified: actor\.manager_role_verified/);
assert.match(readiness, /caller_supplied_identity_allowed: false/);

console.log("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_MANAGER_AUTHORITY_CERTIFIED");
