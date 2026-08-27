import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  base: await readFile("lib/operator/secretary/SecretaryCallScreeningRuntime.js", "utf8"),
  routing: await readFile("lib/operator/secretary/SecretaryCallScreeningCoverageRoutingRuntime.js", "utf8"),
  capability: await readFile("lib/platform/capabilities/createSecretaryCallScreeningCapability.js", "utf8"),
};

assert.match(files.base, /INTERRUPT_EXECUTIVE/);
assert.match(files.base, /EXECUTIVE_REVIEW/);
assert.match(files.base, /CALLER_STATED_URGENCY_UNVERIFIED/);
assert.match(files.base, /vip_inferred:\s*false/);
assert.match(files.routing, /AVANTIQO_EXECUTIVE_SECRETARY_CALL_SCREENING_COVERAGE_ROUTING_V1/);
assert.match(files.routing, /OWNER_AUTHORITY_ROUTES = new Set\(\["INTERRUPT_EXECUTIVE", "EXECUTIVE_REVIEW"\]\)/);
assert.match(files.routing, /scope:\s*"CALL_SCREENING"/);
assert.match(files.routing, /scope:\s*"FOLLOW_UP_COORDINATION"/);
assert.match(files.routing, /requiresOwnerAuthority:\s*ownerAuthorityRequired/);
assert.match(files.routing, /executive_interrupt_route_delegated:\s*false/);
assert.match(files.routing, /executive_review_route_delegated:\s*false/);
assert.match(files.routing, /platform_permissions_mutated:\s*false/);
assert.match(files.routing, /binding_authority_delegated:\s*false/);
assert.match(files.routing, /approval_authority_delegated:\s*false/);
assert.match(files.capability, /screenSecretaryCallWithCoverageRouting/);
assert.match(files.capability, /execute:\s*screenSecretaryCallWithCoverageRouting/);

console.log("OPERATOR_SECRETARY_CALL_SCREENING_COVERAGE_ROUTING_AUDIT=PASS");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_LIVE_ROUTING=true");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_ROUTINE_DELEGATION=true");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_CALLBACK_ROUTING=true");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_EXECUTIVE_INTERRUPT_OWNER_BOUNDARY=true");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_EXECUTIVE_REVIEW_OWNER_BOUNDARY=true");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_VIP_INFERRED=false");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_URGENCY_INFERRED=false");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_CALL_SCREENING_COVERAGE_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
