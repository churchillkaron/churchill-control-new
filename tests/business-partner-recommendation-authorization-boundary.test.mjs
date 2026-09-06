import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("recommendation proposal does not create pending execution or autonomous run", () => {
  const state = source("lib/operator/contracts/OperatorRecommendationState.js");
  const governed = source("lib/operator/runtime/OperatorTurnRuntimeGoverned.js");

  assert.match(state, /selection_state:\s*"PROPOSED"/);
  assert.match(state, /agreementWithOperatorRecommendationProposal/);
  assert.match(state, /delete next\.pending_execution/);
  assert.match(state, /delete next\.autonomous_run/);
  assert.match(state, /operatorRecommendationIsProposal/);

  assert.match(governed, /normalizeFreshRecommendationOffer/);
  assert.match(governed, /recommendation_proposed:\s*true/);
  assert.match(governed, /pending_execution_created:\s*false/);
  assert.match(governed, /autonomous_run_created:\s*false/);
  assert.match(governed, /execution_authorized:\s*false/);
  assert.match(governed, /separate_selection_required:\s*true/);
  assert.match(governed, /separate_execution_instruction_required:\s*true/);
});

test("first explicit recommendation reply selects and binds but does not execute", () => {
  const governed = source("lib/operator/runtime/OperatorTurnRuntimeGoverned.js");
  const state = source("lib/operator/contracts/OperatorRecommendationState.js");

  assert.match(governed, /recommendationProposalDecisionClass/);
  assert.match(governed, /reply === "agree" \|\| reply === "execute"/);
  assert.match(governed, /recommendationProposalDecisionTurn/);
  assert.match(governed, /recommendation_selected:\s*true/);
  assert.match(governed, /pending_execution_created:\s*true/);
  assert.match(governed, /autonomous_run_created:\s*true/);
  assert.match(governed, /execution_authorized:\s*false/);
  assert.match(governed, /mutation_executed:\s*false/);
  assert.match(governed, /Say “do it” again/);

  assert.match(state, /selection_state:\s*"SELECTED"/);
  assert.match(state, /pending_execution:\s*pendingExecution/);
  assert.match(state, /createOperatorAutonomousRun/);
});

test("selected recommendation still requires exact pending binding before execution shorthand can reach legacy governed execution", () => {
  const governed = source("lib/operator/runtime/OperatorTurnRuntimeGoverned.js");
  const state = source("lib/operator/contracts/OperatorRecommendationState.js");
  const legacy = source("lib/operator/runtime/OperatorTurnRuntimeLegacy.js");

  assert.match(state, /operatorRecommendationMatchesPendingExecution/);
  assert.match(state, /normalized\.selection_state === "PROPOSED"/);
  assert.match(state, /recommendationBindingId !== pendingBindingId/);
  assert.match(state, /text\(run\.run_kind, 40\)\.toLowerCase\(\) !== "single_action"/);

  assert.match(governed, /if \(!proposal\) \{[\s\S]*recommendationProposalDecisionClass/);
  assert.match(governed, /return legacyRunOperatorTurn\(options\)/);

  assert.match(legacy, /pendingReplyClass/);
  assert.match(legacy, /operatorRecommendationMatchesPendingExecution/);
  assert.match(legacy, /acceptedRecommendation/);
  assert.match(legacy, /normalizedPendingMessage\(options\.message, replyClass\)/);
});

test("Product Engineering recommendation cannot auto-run from post-commit continuation", () => {
  const governed = source("lib/operator/runtime/OperatorTurnRuntimeGoverned.js");
  const legacy = source("lib/operator/runtime/OperatorTurnRuntimeLegacy.js");

  assert.match(legacy, /PRODUCT_ENGINEERING_CYCLE_KEY/);
  assert.match(legacy, /postCommitContinuationHandoff/);
  assert.match(legacy, /agreementWithOperatorRecommendation\(/);
  assert.match(governed, /normalizeFreshRecommendationOffer/);
  assert.match(governed, /recommendation_authorization_effect:\s*"NONE"/);
  assert.match(governed, /pending_execution_created:\s*false/);
  assert.match(governed, /separate_execution_instruction_required:\s*true/);
});