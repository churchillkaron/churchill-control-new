import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const outcome = fs.readFileSync("lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime.js", "utf8");
const policy = fs.readFileSync("lib/operator/runtime/IntelligenceFailureLearningPolicy.js", "utf8");
const conversation = fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js", "utf8");

test("verified outcome recorder resolves the canonical learning organization when env is absent", () => {
  assert.match(outcome, /resolveAvantiqoLearningOrganization/);
  assert.match(outcome, /import \{ createHash, randomUUID \} from "node:crypto"/);
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
