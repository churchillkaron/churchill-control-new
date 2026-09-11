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

test("Business Partner never converts missing response evidence into false completion", () => {
  const route = source("app/api/operator/turn/route.js");
  const client = source("components/operator/HomeAvantiqoIntelligence.jsx");

  assert.doesNotMatch(
    route,
    /text\(result\?\.decision\?\.response_text\)\s*\|\|\s*"Done\."/,
  );
  assert.match(
    route,
    /No action was assumed complete\./,
  );
  assert.match(
    route,
    /const normalizedDecision = \{[\s\S]*response_text:\s*responseText/,
  );
  assert.match(
    route,
    /const normalizedResult = \{[\s\S]*decision:\s*normalizedDecision/,
  );
  assert.match(route, /\.\.\.normalizedResult/);

  assert.doesNotMatch(
    client,
    /decision\?\.response_text\s*\|\|\s*"Done\."/,
  );
  assert.match(
    client,
    /const responseText = text\(decision\?\.response_text\)/,
  );
  assert.match(
    client,
    /if \(!responseText\) \{[\s\S]*No action was assumed complete\./,
  );
});

test("Business Partner cannot claim mutation completion after verification failure", () => {
  const operator = source("lib/operator/runtime/OperatorTurnRuntime.js");

  assert.match(
    operator,
    /const rolledBackDecision = rollbackUnverifiedProjectProgress\(/,
  );
  assert.match(operator, /intent:\s*"verification_required"/);
  assert.match(operator, /business_effect_verified:\s*false/);
  assert.match(operator, /mutation_replay_allowed:\s*false/);
  assert.match(operator, /completion_claim_allowed:\s*false/);
});