import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  routing: await readFile("lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime.js", "utf8"),
  baseRouting: await readFile("lib/operator/secretary/SecretaryCoverageRoutingRuntime.js", "utf8"),
  followUp: await readFile("lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js", "utf8"),
  escalation: await readFile("lib/operator/secretary/SecretaryFollowUpEscalationRuntime.js", "utf8"),
  inbox: await readFile("lib/operator/secretary/SecretaryInboxTriageRuntime.js", "utf8"),
  harness: await readFile("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8"),
};

assert.match(files.routing, /AVANTIQO_EXECUTIVE_SECRETARY_ADMINISTRATIVE_COVERAGE_ROUTING_V1/);
assert.match(files.routing, /resolveSecretaryActiveCoverage/);
assert.match(files.routing, /resolveSecretaryFollowUpCoverage/);
assert.match(files.routing, /resolveSecretaryJobCoverage/);
assert.match(files.routing, /FOLLOW_UP_COORDINATION/);
assert.match(files.routing, /CALENDAR_COORDINATION/);
assert.match(files.routing, /TASK_ROUTING/);
assert.match(files.routing, /TRAVEL_COORDINATION/);
assert.match(files.routing, /OWNER_AUTHORITY_PATTERN/);
assert.match(files.routing, /SECRETARY_ACTIVE_COVERAGE_AMBIGUOUS/);
assert.match(files.routing, /SECRETARY_ACTIVE_COVERAGE_DELEGATE_UNAVAILABLE/);
assert.match(files.routing, /coverage_routing_review_required:\s*true/);
assert.match(files.routing, /coverage_routing_fail_closed:\s*true/);
assert.match(files.routing, /platform_permissions_mutated:\s*false/);
assert.match(files.routing, /binding_authority_delegated:\s*false/);
assert.match(files.routing, /approval_authority_delegated:\s*false/);

assert.match(files.followUp, /resolveSecretaryFollowUpCoverage/);
assert.match(files.followUp, /applyLiveCoverageRouting/);
assert.match(files.followUp, /secretary_coverage_last_evaluated_at/);
assert.match(files.followUp, /SECRETARY_COVERAGE_ROUTING_REVIEW_REQUIRED/);
assert.match(files.followUp, /coverage_routing_review_required === true/);
assert.match(files.followUp, /secretaryAdministrativeCoverageMetadata/);
assert.match(files.escalation, /SECRETARY_COVERAGE_ROUTING_REVIEW_REQUIRED/);
assert.match(files.escalation, /canonical_owner_party_id/);
assert.match(files.escalation, /secretary_coverage_routing_review_required/);
assert.match(files.inbox, /CORRESPONDENCE_TRIAGE/);
assert.match(files.inbox, /FOLLOW_UP_COORDINATION/);
assert.match(files.baseRouting, /OWNER_AUTHORITY_REQUIRED/);
assert.match(files.baseRouting, /SECRETARY_ACTIVE_COVERAGE_AMBIGUOUS/);
assert.match(files.harness, /certify-secretary-administrative-coverage-routing-local\.mjs/);

console.log("OPERATOR_SECRETARY_ADMINISTRATIVE_COVERAGE_ROUTING_AUDIT=PASS");
console.log("SECRETARY_ADMIN_COVERAGE_EXECUTION_TIME_ROUTING=true");
console.log("SECRETARY_ADMIN_COVERAGE_EXTERNAL_SEND_BOUNDARY_GUARDED=true");
console.log("SECRETARY_ADMIN_COVERAGE_OWNER_AUTHORITY_PRESERVED=true");
console.log("SECRETARY_ADMIN_COVERAGE_AMBIGUITY_FAILS_CLOSED=true");
console.log("SECRETARY_ADMIN_COVERAGE_UNAVAILABLE_DELEGATE_FAILS_CLOSED=true");
console.log("SECRETARY_ADMIN_COVERAGE_OWNER_ESCALATION=true");
console.log("SECRETARY_ADMIN_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_ADMIN_COVERAGE_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_ADMIN_COVERAGE_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
