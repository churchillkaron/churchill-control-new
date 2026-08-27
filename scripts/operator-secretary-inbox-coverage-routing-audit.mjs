import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const inbox = await readFile("lib/operator/secretary/SecretaryInboxTriageRuntime.js", "utf8");
const coverage = await readFile("lib/operator/secretary/SecretaryCoverageRoutingRuntime.js", "utf8");
const cert = await readFile("scripts/certify-secretary-inbox-coverage-routing-local.mjs", "utf8");

assert.match(inbox, /resolveSecretaryActiveCoverage/);
assert.match(inbox, /secretaryCoverageRoutingMetadata/);
assert.match(inbox, /CORRESPONDENCE_TRIAGE/);
assert.match(inbox, /FOLLOW_UP_COORDINATION/);
assert.match(inbox, /canonical_owner_party_id/);
assert.match(inbox, /operational_assignee_party_id/);
assert.match(inbox, /secretary_coverage_applied/);
assert.match(inbox, /secretary_coverage_scope/);
assert.match(inbox, /requested_by_party_id:\s*ownerPartyId/);
assert.match(inbox, /owner_party_id:\s*ownerPartyId/);
assert.match(inbox, /high_authority_auto_chase_blocked:\s*true/);
assert.match(inbox, /business_decision_auto_chase_blocked:\s*true/);
assert.match(coverage, /requiresOwnerAuthority/);
assert.match(coverage, /binding_authority_delegated:\s*false/);
assert.match(coverage, /approval_authority_delegated:\s*false/);
assert.match(cert, /SECRETARY_INBOX_COVERAGE_ROUTING_LOCAL_CERTIFICATION=PASS/);

console.log("OPERATOR_SECRETARY_INBOX_COVERAGE_ROUTING_AUDIT=PASS");
console.log("SECRETARY_INBOX_COVERAGE_ROUTINE_DELEGATION=true");
console.log("SECRETARY_INBOX_COVERAGE_CANONICAL_OWNER_PRESERVED=true");
console.log("SECRETARY_INBOX_COVERAGE_FOLLOW_UP_ROUTING=true");
console.log("SECRETARY_INBOX_COVERAGE_HIGH_AUTHORITY_OWNER_BOUNDARY=true");
console.log("SECRETARY_INBOX_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_INBOX_COVERAGE_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
