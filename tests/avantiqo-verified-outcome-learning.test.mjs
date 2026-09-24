import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const outcome = fs.readFileSync("lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime.js", "utf8");
const policy = fs.readFileSync("lib/operator/runtime/IntelligenceFailureLearningPolicy.js", "utf8");
const conversation = fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js", "utf8");

test("verified outcome recorder resolves the canonical learning organization when env is absent", () => {
  assert.match(outcome, /resolveAvantiqoLearningOrganization/);
  assert.match(outcome, /import \{ createHash \} from "node:crypto"/);
  assert.match(outcome, /rollingOutcomeBucket/);
  assert.doesNotMatch(outcome, /randomUUID/);
  assert.match(outcome, /allowDatabaseFallback: true/);
  assert.match(outcome, /await resolveLearningOrganizationId\(\)/);
});

test("live Business Partner persistence records verified outcomes", () => {
  assert.match(conversation, /recordAvantiqoVerifiedExecutionOutcome/);
  assert.match(conversation, /execution: object\(execution\)/);
});

test("completed reads are verified outcomes but writes require independently verified business effect", () => {
  assert.match(policy, /mode !== "read"/);
  assert.match(policy, /verificationStatus !== "completed" \|\| !businessEffectVerified/);
  assert.match(policy, /verification\.business_effect_verified === true/);
  assert.match(policy, /deterministic_business_effect_verified === true/);
});

test("outcome learning persists only structural non-customer evidence", () => {
  for (const pattern of [/structural_outcome_only: true/,/customer_private_content_included: false/,/customer_identifiers_included: false/,/raw_payload_persisted: false/,/raw_output_persisted: false/,/raw_reasoning_persisted: false/,/authorization_value: "none"/]) assert.match(outcome, pattern);
});

test("live verified outcomes are idempotent per persisted assistant turn", () => {
  assert.match(outcome, /sourceTurnId = null/);
  assert.match(outcome, /verified-outcome-turn:/);
  assert.match(outcome, /onConflict: "organization_id,memory_scope,memory_key"/);
  assert.match(conversation, /persistedTurnId/);
  assert.match(conversation, /sourceTurnId: persistedTurnId/);
});

test("runtime and model failures do not poison verified capability outcome reliability", () => {
  assert.match(outcome, /failure\?\.affects_capability_reliability === true/);
  assert.match(policy, /TRANSPORT_RUNTIME_FAILURE/);
  assert.match(policy, /MODEL_REASONING_FAILURE/);
  assert.match(policy, /BUSINESS_OUTCOME_FAILURE/);
  assert.match(policy, /affects_capability_reliability/);
});

test("event continuation persistence deduplicates before creating another turn or verified outcome", () => {
  assert.match(conversation, /findPersistedAssistantContinuationTurn/);
  assert.match(conversation, /continuation_idempotency_key/);
  assert.match(conversation, /if \(existing\) \{/);
  assert.match(conversation, /duplicate: true/);
  assert.match(conversation, /persistAssistantTurnAndConversationState\(\{[\s\S]*continuationIdempotencyKey = null/);
  assert.match(conversation, /const continuationKey = text\(continuationIdempotencyKey, 300\)/);
});


test("prerequisite failures remain recovery telemetry and do not become verified capability failures", () => {
  assert.match(policy, /affects_capability_reliability: failureClass === "BUSINESS_OUTCOME_FAILURE"/);
  assert.match(policy, /prerequisite_signal: failureClass === "PREREQUISITE_FAILURE"/);
  assert.doesNotMatch(policy, /\["BUSINESS_OUTCOME_FAILURE", "PREREQUISITE_FAILURE"\]\.includes/);
});
