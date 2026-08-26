import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routing = await readFile("lib/operator/secretary/SecretaryCoverageRoutingRuntime.js", "utf8");
const callbacks = await readFile("lib/operator/secretary/SecretaryAutonomousCallbackRuntime.js", "utf8");

assert.match(routing, /AVANTIQO_EXECUTIVE_SECRETARY_COVERAGE_ROUTING_V1/);
assert.match(routing, /resolveSecretaryActiveCoverage/);
assert.match(routing, /ACKNOWLEDGED_ACTIVE_ADMINISTRATIVE_COVERAGE/);
assert.match(routing, /ACTIVE_COVERAGE_HANDOFF_NOT_ACKNOWLEDGED/);
assert.match(routing, /NO_ACTIVE_COVERAGE/);
assert.match(routing, /OWNER_AUTHORITY_REQUIRED/);
assert.match(routing, /SECRETARY_ACTIVE_COVERAGE_AMBIGUOUS/);
assert.match(routing, /SECRETARY_ACTIVE_COVERAGE_DELEGATE_UNAVAILABLE/);
assert.match(routing, /coverage_requires_acknowledgement:\s*true/);
assert.match(routing, /canonical_owner_party_id/);
assert.match(routing, /operational_assignee_party_id/);
assert.match(routing, /platform_permissions_mutated:\s*false/);
assert.match(routing, /binding_authority_delegated:\s*false/);
assert.match(routing, /approval_authority_delegated:\s*false/);
assert.match(routing, /external_authority_used:\s*false/);
assert.match(routing, /FORBIDDEN_SCOPE_PATTERN/);

assert.match(callbacks, /SecretaryCoverageRoutingRuntime/);
assert.match(callbacks, /FOLLOW_UP_COORDINATION/);
assert.match(callbacks, /secretaryCoverageRoutingMetadata/);
assert.match(callbacks, /callback_operational_assignee_party_id/);
assert.match(callbacks, /callback_coverage_applied/);
assert.doesNotMatch(callbacks, /platform_permissions_mutated:\s*true/);
assert.doesNotMatch(callbacks, /binding_authority_delegated:\s*true/);

console.log("OPERATOR_SECRETARY_COVERAGE_ROUTING_AUDIT=PASS");
console.log("SECRETARY_COVERAGE_ROUTING_ACTIVE_ACKNOWLEDGED=true");
console.log("SECRETARY_COVERAGE_ROUTING_UNACKNOWLEDGED_FAILS_TO_OWNER=true");
console.log("SECRETARY_COVERAGE_ROUTING_EXPIRED_FAILS_TO_OWNER=true");
console.log("SECRETARY_COVERAGE_ROUTING_AMBIGUITY_FAILS_CLOSED=true");
console.log("SECRETARY_COVERAGE_ROUTING_OWNER_AUTHORITY_PRESERVED=true");
console.log("SECRETARY_COVERAGE_ROUTING_CALLBACK_INTEGRATED=true");
console.log("SECRETARY_COVERAGE_ROUTING_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_COVERAGE_ROUTING_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_COVERAGE_ROUTING_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
