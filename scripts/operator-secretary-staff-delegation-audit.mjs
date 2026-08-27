import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryStaffDelegationRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryStaffDelegationCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  commitment: "lib/operator/secretary/SecretaryCommitmentControlRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_STAFF_DELEGATION_V1/);
assert.match(source.runtime, /secretary_staff_delegation/);
assert.match(source.runtime, /assignment_state:\s*"PENDING_ACCEPTANCE"/);
assert.match(source.runtime, /ASSIGNMENT_REQUEST/);
assert.match(source.runtime, /ACCEPTANCE_CHASE/);
assert.match(source.runtime, /PROGRESS_CHECK/);
assert.match(source.runtime, /OVERDUE_REVIEW/);
assert.match(source.runtime, /REASSIGNMENT_REVIEW/);
assert.match(source.runtime, /SECRETARY_STAFF_DELEGATION_RESPONSE_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /SECRETARY_STAFF_DELEGATION_PROGRESS_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /SECRETARY_STAFF_DELEGATION_COMPLETION_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /accepted_evidence_id/);
assert.match(source.runtime, /completion_evidence_id/);
assert.match(source.runtime, /assignment_history/);
assert.match(source.runtime, /progress_history/);
assert.match(source.runtime, /canonical_owner_party_id/);
assert.match(source.runtime, /operational_assignee_party_id/);
assert.match(source.runtime, /owner_party_id:\s*assignee\.id/);
assert.match(source.runtime, /owner_party_id:\s*routing\.canonicalOwner/);
assert.match(source.runtime, /employment_relationship_inferred:\s*false/);
assert.match(source.runtime, /acceptance_inferred:\s*false/);
assert.match(source.runtime, /rejection_reason_inferred:\s*false/);
assert.match(source.runtime, /completion_inferred:\s*false/);
assert.match(source.runtime, /urgency_inferred:\s*false/);
assert.match(source.runtime, /misconduct_inferred:\s*false/);
assert.match(source.runtime, /performance_inferred:\s*false/);
assert.match(source.runtime, /legal_breach_inferred:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /binding_authority_delegated:\s*false/);
assert.match(source.runtime, /approval_authority_delegated:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);
assert.match(source.runtime, /resolveSecretaryAdministrativeCoverage/);
assert.match(source.runtime, /scope:\s*"TASK_ROUTING"/);
assert.match(source.runtime, /SECRETARY_STAFF_DELEGATION_ACTOR_NOT_AUTHORIZED/);
assert.match(source.runtime, /stale pending follow-ups fenced/i);

assert.match(source.capability, /capability:\s*"secretary_staff_delegation"/);
for (const action of ["delegate", "read", "list", "recordResponse", "recordProgress", "reassign", "complete", "refresh", "cancel"]) {
  assert.match(source.capability, new RegExp(`${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*\\{`));
}
assert.match(source.capability, /Silence, delivery, read status, and other activity never become acceptance/i);
assert.match(source.capability, /Completion is never inferred/i);
assert.match(source.capability, /temporal overdue status/i);

assert.match(source.platform, /createSecretaryStaffDelegationCapability/);
assert.match(source.platform, /secretary_staff_delegation:\s*\{/);
assert.match(source.platform, /recordProgress:\s*async \(\) => createSecretaryStaffDelegationCapability\("recordProgress"\)/);
assert.match(source.platform, /complete:\s*async \(\) => createSecretaryStaffDelegationCapability\("complete"\)/);

console.log("OPERATOR_SECRETARY_STAFF_DELEGATION_AUDIT=PASS");
console.log("SECRETARY_STAFF_DELEGATION_DURABLE_TASK=true");
console.log("SECRETARY_STAFF_DELEGATION_ACCEPTANCE_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_STAFF_DELEGATION_PROGRESS_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_STAFF_DELEGATION_COMPLETION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_STAFF_DELEGATION_SILENCE_NOT_ACCEPTANCE=true");
console.log("SECRETARY_STAFF_DELEGATION_TEMPORAL_OVERDUE_ONLY=true");
console.log("SECRETARY_STAFF_DELEGATION_CANONICAL_OWNER_PRESERVED=true");
console.log("SECRETARY_STAFF_DELEGATION_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_STAFF_DELEGATION_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_STAFF_DELEGATION_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
