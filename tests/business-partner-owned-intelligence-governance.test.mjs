import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Business Partner deep Intelligence fails closed on owned provider evidence", () => {
  const reasoning = source(
    "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js",
  );

  assert.match(reasoning, /function assertOwnedProvider\(/);
  assert.match(
    reasoning,
    /provider_policy:\s*\{[\s\S]*allowed_providers:\s*\[OWNED_PROVIDER\][\s\S]*owned_only_required:\s*true[\s\S]*external_fallback_allowed:\s*false/,
  );
  assert.match(
    reasoning,
    /const provider = assertOwnedProvider\(execution\?\.provider,\s*"EXECUTION"\)/,
  );
  assert.match(
    reasoning,
    /intelligence_owned_provider_verified:\s*true/,
  );
  assert.match(reasoning, /external_ai_fallback_used:\s*false/);
  assert.match(
    reasoning,
    /assertOwnedProvider\(pendingProvider,\s*"PENDING_SETTLEMENT"\)/,
  );
  assert.match(
    reasoning,
    /assertOwnedProvider\(settledProvider,\s*"SETTLED_EXECUTION"\)/,
  );
  assert.doesNotMatch(
    reasoning,
    /execution\?\.provider\s*\|\|\s*OWNED_PROVIDER/,
  );
});

test("Business Partner owned cognition preserves Operator and Code execution governance", () => {
  const synthetic = source(
    "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
  );
  const operator = source("lib/operator/runtime/OperatorTurnRuntime.js");
  const reasoning = source(
    "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js",
  );

  assert.match(
    synthetic,
    /authorization:\s*\{\s*allow_mutating_tools:\s*false\s*\}/,
  );
  assert.match(
    synthetic,
    /Do not execute writes or claim that any mutation happened in this phase/,
  );
  assert.match(operator, /runGovernedOperatorTurn/);
  assert.match(operator, /evaluateOperatorIntelligenceExecutionGuard/);
  assert.match(operator, /stagedMutationRequiresCognitiveBlock/);
  assert.match(operator, /withCodeCustomerArtifactReply/);
  assert.match(
    reasoning,
    /authorization:\s*object\(authorization\)/,
  );
});
