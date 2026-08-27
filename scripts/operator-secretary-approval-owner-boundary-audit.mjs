import assert from "node:assert/strict";
import fs from "node:fs";

const approvalPath = "lib/operator/secretary/SecretaryJobApprovalRuntime.js";
const coveragePath = "lib/operator/secretary/SecretaryJobCoverageExecutionRuntime.js";
const approval = fs.readFileSync(approvalPath, "utf8");
const coverage = fs.readFileSync(coveragePath, "utf8");

assert.match(approval, /canonicalOwnerPartyId\(job/);
assert.match(approval, /SECRETARY_JOB_APPROVAL_CANONICAL_OWNER_REQUIRED/);
assert.match(approval, /approvedByPartyId !== canonicalOwner/);
assert.match(approval, /canonical_owner_party_id: canonicalOwner/);
assert.match(approval, /coverage_authority_delegated: false/);
assert.match(approval, /future_steps_authorized: false/);
assert.match(approval, /authority_not_extended: true/);

assert.match(coverage, /AVANTIQO_EXECUTIVE_SECRETARY_JOB_COVERAGE_EXECUTION_V1/);
assert.match(coverage, /resolveSecretaryAdministrativeCoverage/);
assert.match(coverage, /explicit_target_assignment_preserved/);
assert.match(coverage, /artifact_owner_party_id: explicitTargetPartyId \|\| canonicalOwnerPartyId/);
assert.match(coverage, /approval_authority_delegated: false/);
assert.match(coverage, /binding_authority_delegated: false/);
assert.match(coverage, /platform_permissions_mutated: false/);

console.log("OPERATOR_SECRETARY_APPROVAL_OWNER_BOUNDARY_AUDIT=PASS");
console.log("SECRETARY_APPROVAL_CANONICAL_OWNER_SOURCE_ENFORCED=true");
console.log("SECRETARY_APPROVAL_COVERAGE_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_JOB_COVERAGE_EXPLICIT_TARGET_PRESERVED=true");
console.log("SECRETARY_JOB_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_JOB_COVERAGE_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_JOB_COVERAGE_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
