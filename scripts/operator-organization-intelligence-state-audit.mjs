import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [stateSource, thesisSource, turnSource] = await Promise.all([
  readFile(
    "lib/operator/runtime/OperatorOrganizationIntelligenceStateRuntime.js",
    "utf8",
  ),
  readFile("lib/operator/runtime/OperatorBusinessThesisRuntime.js", "utf8"),
  readFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8"),
]);

assert.match(stateSource, /AVANTIQO_ORGANIZATION_INTELLIGENCE_STATE_V1/);
assert.match(stateSource, /MEMORY_SCOPE = "organization"/);
assert.match(stateSource, /organization_intelligence_state:v1/);
assert.match(stateSource, /party_id:\s*null/);
assert.match(stateSource, /conversation_id:\s*null/);
assert.match(stateSource, /source_turn_id:\s*null/);
assert.match(stateSource, /historical_context_only:\s*true/);
assert.match(stateSource, /not_live_proof:\s*true/);
assert.match(stateSource, /never_authorization:\s*true/);
assert.match(stateSource, /revision:\s*revision\(current\.revision\) \+ 1/);
assert.match(stateSource, /query\.eq\("updated_at", expectedUpdatedAt\)/);
assert.match(stateSource, /ORGANIZATION_INTELLIGENCE_STATE_CONCURRENT_UPDATE_RETRY_EXHAUSTED/);
assert.match(stateSource, /stale_thesis_ignored:\s*true/);
assert.match(stateSource, /persistOrganizationBusinessThesis/);
assert.doesNotMatch(stateSource, /agreement_state/);
assert.doesNotMatch(stateSource, /pending_execution/);
assert.doesNotMatch(stateSource, /approval_request_id/);

assert.match(thesisSource, /loadOrganizationIntelligenceState/);
assert.match(thesisSource, /persistOrganizationBusinessThesis/);
assert.match(thesisSource, /await canonicalPreviousThesis\(context, previousThesis\)/);
assert.match(thesisSource, /newestThesis/);
assert.match(thesisSource, /return persistCanonicalThesis\(/);
assert.match(thesisSource, /previous_business_thesis: previous/);
assert.match(thesisSource, /Prior thesis is context for comparison, never proof/i);

assert.match(turnSource, /loadOrganizationIntelligenceState/);
assert.match(turnSource, /async function organizationProjectState/);
assert.match(turnSource, /business_thesis:\s*businessThesis/);
assert.match(turnSource, /historical_context_only:\s*true/);
assert.match(turnSource, /not_live_proof:\s*true/);
assert.match(turnSource, /never_authorization:\s*true/);
assert.match(turnSource, /const effectiveProjectState = await organizationProjectState\(options\)/);
assert.match(turnSource, /isForecastAccountabilityQuestion\(effectiveOptions\.message\)/);
assert.match(turnSource, /organization_brain_used/);
assert.match(turnSource, /organization_brain_revision/);

console.log("OPERATOR_ORGANIZATION_INTELLIGENCE_STATE_AUDIT=PASS");
console.log("OPERATOR_ORGANIZATION_BRAIN_SCOPE=ONE_CANONICAL_STATE_PER_ORGANIZATION");
console.log("OPERATOR_ORGANIZATION_BRAIN_THESIS=SHARED_ACROSS_CONVERSATIONS");
console.log("OPERATOR_ORGANIZATION_BRAIN_CURRENT_FACTS=LIVE_READ_REQUIRED");
console.log("OPERATOR_ORGANIZATION_BRAIN_AUTHORIZATION=NEVER_INHERITED");
console.log("OPERATOR_ORGANIZATION_BRAIN_CONCURRENCY=OPTIMISTIC_RETRY");
