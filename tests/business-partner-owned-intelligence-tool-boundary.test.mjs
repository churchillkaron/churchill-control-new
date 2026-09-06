import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Business Partner certification exercises read and candidate tools without mutation authority", () => {
  const certification = source(
    "scripts/certify-business-partner-owned-intelligence-tool-boundary-local.mjs",
  );

  assert.match(certification, /operator_live_read/);
  assert.match(certification, /operator_action_candidate/);
  assert.match(certification, /authorization:\s*\{\s*allow_mutating_tools:\s*false\s*\}/);
  assert.match(certification, /owned_provider_verified\s*===\s*true/);
  assert.match(certification, /external_ai_fallback_used\s*!==\s*true/);
  assert.match(certification, /candidate_only/);
  assert.match(certification, /executed\s*===\s*false/);
  assert.match(certification, /persisted\s*===\s*false/);
  assert.match(certification, /transcriptCalls\.every\(\(call\)\s*=>\s*call\?\.mutates\s*!==\s*true\)/);
  assert.match(certification, /production_deploy_performed:\s*false/);
});

test("Business Partner planning tools remain read-only or candidate-only", () => {
  const bridge = source(
    "lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js",
  );
  const candidate = source(
    "lib/operator/runtime/OperatorIntelligenceActionCandidateRuntime.js",
  );

  assert.match(bridge, /mode !== "read"/);
  assert.match(bridge, /mutates:\s*false/);
  assert.match(bridge, /This tool cannot write, approve, publish, send, pay, deploy, mutate, or bypass governance/);
  assert.match(candidate, /candidate_only:\s*true/);
  assert.match(candidate, /executed:\s*false/);
  assert.match(candidate, /persisted:\s*false/);
  assert.match(candidate, /normal_operator_governance_required:\s*true/);
  assert.match(candidate, /mutates:\s*false/);
});

test("Code and business mutation authority stays behind governed Operator", () => {
  const synthetic = source(
    "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
  );
  const operator = source("lib/operator/runtime/OperatorTurnRuntime.js");
  const reasoning = source(
    "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js",
  );

  assert.match(synthetic, /authorization:\s*\{\s*allow_mutating_tools:\s*false\s*\}/);
  assert.match(synthetic, /Do not execute writes or claim that any mutation happened in this phase/);
  assert.match(operator, /runGovernedOperatorTurn/);
  assert.match(operator, /evaluateOperatorIntelligenceExecutionGuard/);
  assert.match(operator, /stagedMutationRequiresCognitiveBlock/);
  assert.match(operator, /withCodeCustomerArtifactReply/);
  assert.match(reasoning, /assertOwnedProvider\(execution\?\.provider,\s*"EXECUTION"\)/);
});