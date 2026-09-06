import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("recommended_action always bypasses fast-first and reaches governed state handling", () => {
  const fast = source("lib/operator/runtime/OperatorFastFirstPolicy.js");
  assert.match(fast, /STATEFUL_AGREEMENT_KEYS[\s\S]*"recommended_action"/);
  assert.match(fast, /if \(hasStatefulAgreement\(agreementState\)\) return false/);
});

test("selected recommendation completion fails closed when independent business-effect verification is absent", () => {
  const runtime = source("lib/operator/runtime/OperatorTurnRuntime.js");
  assert.match(runtime, /operatorRecommendationMatchesPendingExecution/);
  assert.match(runtime, /recommendation\?\.selection_state === "SELECTED"/);
  assert.match(runtime, /exactSelectedRecommendationBinding\(priorAgreementState\)/);
  assert.doesNotMatch(
    runtime,
    /!state\.verification_present\s*\|\|\s*state\.business_effect_verified/,
  );
  assert.match(runtime, /POST_ACTION_VERIFICATION_NOT_REGISTERED/);
  assert.match(runtime, /delete current\.pending_execution/);
  assert.match(runtime, /transitionOperatorAutonomousRun\(priorRun,[\s\S]*status: "blocked"[\s\S]*stepId: "requested_action"[\s\S]*stepStatus: "completed"/);
  assert.match(runtime, /mutation_replay_allowed: false/);
  assert.match(runtime, /completion_claim_allowed: false/);
  assert.match(runtime, /business_effect_verified: false/);
  assert.match(runtime, /effectiveOptions\.agreementState/);
});

test("current authorization and approval are re-read before the selected mutation reaches UBTE", () => {
  const core = source("lib/operator/runtime/OperatorTurnRuntimeCore.js");
  const governance = source("lib/operator/governance/operatorExecutionGovernance.js");

  assert.match(core, /operatorPendingExecutionMatchesAutonomousRun\(offeredPending, activeRun\)/);
  assert.match(core, /const capabilities = safeCapabilities\([\s\S]*permissions[\s\S]*role/);
  assert.match(core, /resolveOperatorExecutionApproval\(/);
  assert.match(core, /executeUbteCapability\(/);
  assert.match(core, /source: "AVANTIQO_OPERATOR"/);
  assert.match(core, /conversationallyConfirmed: true/);

  assert.match(governance, /operator_approval_requests/);
  assert.match(governance, /assertApprovalAuthorizationFresh/);
  assert.match(governance, /approval_request_id/i);
});

test("registered post-action verification remains read-only and memory never learns unverified mutation effects", () => {
  const core = source("lib/operator/runtime/OperatorTurnRuntimeCore.js");
  const memory = source("lib/operator/runtime/IntelligenceExecutionMemoryPolicy.js");

  assert.match(core, /pending\.verify_after\.capability_key/);
  assert.match(core, /item\.mode === "read"/);
  assert.match(core, /POST_ACTION_VERIFICATION_CAPABILITY_NOT_AVAILABLE/);
  assert.match(core, /resume_kind: "verification"/);
  assert.match(core, /I will not replay the write/);

  assert.match(memory, /business_effect_verified:\s*verificationStatus === "completed"/);
  assert.match(memory, /return state\.business_effect_verified === true/);
});

test("Business Partner mutation truthfulness does not grant Intelligence or Code execution authority", () => {
  const runtime = source("lib/operator/runtime/OperatorTurnRuntime.js");
  const candidate = source("lib/operator/runtime/OperatorIntelligenceActionCandidateRuntime.js");
  const synthetic = source("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");

  assert.match(candidate, /candidate_only:\s*true/);
  assert.match(candidate, /executed:\s*false/);
  assert.match(candidate, /persisted:\s*false/);
  assert.match(runtime, /runGovernedOperatorTurn/);
  assert.match(runtime, /withCodeCustomerArtifactReply/);
  assert.match(synthetic, /allow_mutating_tools:\s*false/);
  assert.match(synthetic, /PRODUCT_ENGINEERING_CYCLE_KEY/);
});