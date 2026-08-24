import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const refinementPath =
  "lib/operator/contracts/OperatorRecommendationRefinementState.js";
const recommendationPath =
  "lib/operator/contracts/OperatorRecommendationState.js";
const syntheticPath =
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js";
const operatorTurnPath = "lib/operator/runtime/OperatorTurnRuntimeLegacy.js";
const productCyclePath =
  "lib/platform/capabilities/createProductEngineeringCycleCapability.js";

const files = Object.fromEntries(
  await Promise.all(
    [
      refinementPath,
      recommendationPath,
      syntheticPath,
      operatorTurnPath,
      productCyclePath,
    ].map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

function requireFragments(path, fragments) {
  const source = files[path];
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
  }
}

requireFragments(refinementPath, [
  'REFINEMENT_KEY = "recommendation_refinement"',
  'PRODUCT_ENGINEERING_CYCLE_KEY =',
  '"platform.product_engineering_cycle.execute"',
  'status: "PROPOSED_PRODUCT_ENGINEERING_REFINEMENT"',
  "candidate.automatic_execution_started !== false",
  'text(candidate.authorization_effect, 40).toUpperCase() !== "NONE"',
  "candidate.current_main_reassessment_required !== true",
  "candidate.focus_is_priority_context_only !== true",
  "automatic_execution_started: false",
  'authorization_effect: "NONE"',
  "current_main_reassessment_required: true",
  "focus_is_priority_context_only: true",
  "previous_recommendation_id:",
  "previous_focus:",
  "productEngineeringRecommendationFromRefinement",
  "payload: { focus }",
  'source: "product_engineering_discussion_refinement"',
  "actual current main must still be reassessed before engineering starts",
]);

requireFragments(syntheticPath, [
  "agreementWithProductEngineeringRecommendationRefinement",
  "operatorRecommendationRefinementFromAgreementState",
  "productEngineeringRecommendationFromRefinement",
  "preflightRecommendationRefinement",
  "applyRecommendationRefinementAfterTurn",
  "operatorCatalog.recommendation_alternative !== true",
  "operatorCatalog.execution_authorized !== false",
  "result?.execution",
  "proposedFocus: text(options.message, 2000)",
  "text(options.agreementState?.pending_execution?.capability_key, 240)",
  "text(options.agreementState?.autonomous_run?.run_id, 240)",
  'status: "BLOCKED_STATE_CONFLICT"',
  'status: "PROMOTED_TO_EXACT_RECOMMENDATION"',
  'const requestedExecution = replyClass === "execute"',
  "requested_execution_deferred_until_next_turn: requestedExecution",
  "execution_authorized: false",
  "automatic_execution_started: false",
  "refinement_focus_is_priority_context_only: true",
  "refinement_current_main_reassessment_required: true",
  'refinement_authorization_effect: "NONE"',
  "refinement_automatic_execution_started: false",
  "const refinementPreflight = preflightRecommendationRefinement",
  "const operatorResult = await runOperatorTurn",
  "const result = applyRecommendationRefinementAfterTurn",
  "Say “do it”, “next”, or “continue” once more",
  "actual current main will still be reassessed before engineering starts",
]);

const syntheticSource = files[syntheticPath];
const preflightStart = syntheticSource.indexOf(
  "function preflightRecommendationRefinement",
);
const postprocessStart = syntheticSource.indexOf(
  "function applyRecommendationRefinementAfterTurn",
  preflightStart,
);
assert.ok(preflightStart >= 0, "refinement preflight must exist");
assert.ok(
  postprocessStart > preflightStart,
  "refinement preflight must end before refinement post-processing",
);
const preflightSource = syntheticSource.slice(preflightStart, postprocessStart);
for (const forbidden of [
  "runOperatorTurn(",
  "executeUbteCapability",
  "platform.code_ai_autonomous.execute",
  "platform.code_ai_commit.execute",
]) {
  assert.ok(
    !preflightSource.includes(forbidden),
    `refinement preflight must never execute through ${forbidden}`,
  );
}
assert.ok(
  preflightSource.includes("return refinementLocalTurn"),
  "refinement decisions must resolve locally before governed execution",
);

const runStart = syntheticSource.indexOf(
  "export async function runSyntheticIntelligenceTurn",
);
const preflightCall = syntheticSource.indexOf(
  "preflightRecommendationRefinement(",
  runStart,
);
const operatorCall = syntheticSource.indexOf(
  "const operatorResult = await runOperatorTurn",
  runStart,
);
const postprocessCall = syntheticSource.indexOf(
  "applyRecommendationRefinementAfterTurn(",
  operatorCall,
);
assert.ok(runStart >= 0, "Synthetic Intelligence turn must exist");
assert.ok(
  preflightCall > runStart && preflightCall < operatorCall,
  "refinement preflight must run before governed Operator execution",
);
assert.ok(
  postprocessCall > operatorCall,
  "thinking-only alternative capture must happen after Operator discussion result",
);

requireFragments(operatorTurnPath, [
  "recommendationDiscussionTurn",
  "recommendation_alternative: alternative",
  "execution_authorized: false",
  'previous_recommendation_pending_execution: alternative\n        ? "DISARMED"',
  "execution: null",
]);

requireFragments(productCyclePath, [
  'id: "assess_repository"',
  'capability_key: "platform.product_repository_assessment.read"',
  'source_path: "next_engineering_handoff.focus"',
  'target_path: "objective"',
  "repositoryGroundedAssessmentRequired: true",
  "currentMainRecheckBeforeEngineeringRequired: true",
  "incoming_focus_is_authority: false",
  "repository_grounded_assessment_required: true",
  "current_main_rechecked_before_engineering",
  "prioritization context only",
]);

const {
  agreementWithOperatorRecommendation,
  clearOperatorRecommendation,
  operatorRecommendationFromAgreementState,
  operatorRecommendationMatchesPendingExecution,
} = await import("@/lib/operator/contracts/OperatorRecommendationState");
const {
  agreementWithProductEngineeringRecommendationRefinement,
  clearOperatorRecommendationRefinement,
  operatorRecommendationRefinementFromAgreementState,
  productEngineeringRecommendationFromRefinement,
} = await import(
  "@/lib/operator/contracts/OperatorRecommendationRefinementState"
);

const oldRecommendation = {
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run the old repository-grounded focus",
  payload: { focus: "old repository-grounded focus" },
  objective: "old repository-grounded focus",
  source: "verified_post_commit_product_reassessment",
};
const oldBound = agreementWithOperatorRecommendation({}, oldRecommendation, {
  objective: oldRecommendation.objective,
});
const oldPersisted = operatorRecommendationFromAgreementState(oldBound);
assert.ok(oldPersisted?.recommendation_id, "old recommendation must be bound");
assert.equal(
  operatorRecommendationMatchesPendingExecution(oldBound, oldPersisted),
  true,
  "old recommendation must begin as an exact binding",
);

const clearedOld = clearOperatorRecommendation(oldBound);
const pausedOld = {
  ...clearedOld,
  recommended_action: oldPersisted,
};
assert.equal(pausedOld.pending_execution, undefined);
assert.equal(pausedOld.autonomous_run, undefined);
assert.equal(
  operatorRecommendationFromAgreementState(pausedOld)?.recommendation_id,
  oldPersisted.recommendation_id,
  "old recommendation must remain visible after disarming",
);

const proposedFocus =
  "prioritize the recommendation refinement lifecycle from fresh current main";
const proposedState = agreementWithProductEngineeringRecommendationRefinement(
  pausedOld,
  {
    recommendation: oldPersisted,
    proposedFocus,
  },
);
const refinement = operatorRecommendationRefinementFromAgreementState(
  proposedState,
);
assert.ok(refinement, "Product Engineering alternative must create a proposal");
assert.equal(refinement.proposed_focus, proposedFocus);
assert.equal(refinement.automatic_execution_started, false);
assert.equal(refinement.authorization_effect, "NONE");
assert.equal(refinement.current_main_reassessment_required, true);
assert.equal(refinement.focus_is_priority_context_only, true);
assert.equal(proposedState.pending_execution, undefined);
assert.equal(proposedState.autonomous_run, undefined);
assert.equal(
  operatorRecommendationFromAgreementState(proposedState)?.recommendation_id,
  oldPersisted.recommendation_id,
  "proposal must not silently replace or rearm the old recommendation",
);

const replacement = productEngineeringRecommendationFromRefinement(refinement);
assert.ok(replacement, "valid refinement must produce a replacement recommendation");
assert.equal(
  replacement.capability_key,
  "platform.product_engineering_cycle.execute",
);
assert.deepEqual(replacement.payload, { focus: proposedFocus });
assert.equal(
  replacement.source,
  "product_engineering_discussion_refinement",
);

const withoutRefinement = clearOperatorRecommendationRefinement(proposedState);
const withoutOld = clearOperatorRecommendation(withoutRefinement);
const promotedState = agreementWithOperatorRecommendation(
  withoutOld,
  replacement,
  { objective: proposedFocus },
);
const promoted = operatorRecommendationFromAgreementState(promotedState);
assert.ok(promoted?.recommendation_id, "promoted recommendation must be bound");
assert.notEqual(
  promoted.recommendation_id,
  oldPersisted.recommendation_id,
  "promotion must create a new recommendation binding",
);
assert.equal(
  operatorRecommendationMatchesPendingExecution(promotedState, promoted),
  true,
  "promoted recommendation must exactly match its pending execution and run",
);
assert.equal(promotedState.recommendation_refinement, undefined);
assert.equal(promotedState.pending_execution.capability_key, replacement.capability_key);
assert.deepEqual(promotedState.pending_execution.payload, { focus: proposedFocus });
assert.notEqual(
  promotedState.pending_execution.payload.focus,
  oldRecommendation.payload.focus,
  "old focus must never be silently rearmed",
);

const rejectedState = clearOperatorRecommendationRefinement(proposedState);
assert.equal(rejectedState.recommendation_refinement, undefined);
assert.equal(rejectedState.pending_execution, undefined);
assert.equal(rejectedState.autonomous_run, undefined);
assert.equal(
  operatorRecommendationFromAgreementState(rejectedState)?.recommendation_id,
  oldPersisted.recommendation_id,
  "rejecting refinement must leave the old recommendation visible but paused",
);

console.log("OPERATOR_PRODUCT_RECOMMENDATION_REFINEMENT_AUDIT=PASS");
console.log(
  "OPERATOR_PRODUCT_RECOMMENDATION_REFINEMENT_RUNTIME=LEGACY_BEHIND_GOVERNED_ROUTER",
);
console.log(
  "OPERATOR_PRODUCT_RECOMMENDATION_REFINEMENT_PROPOSAL=PRIORITY_CONTEXT_ONLY_NO_AUTHORITY",
);
console.log(
  "OPERATOR_PRODUCT_RECOMMENDATION_REFINEMENT_OLD_PENDING=DISARMED",
);
console.log(
  "OPERATOR_PRODUCT_RECOMMENDATION_REFINEMENT_FIRST_EXECUTE=SELECTION_ONLY",
);
console.log(
  "OPERATOR_PRODUCT_RECOMMENDATION_REFINEMENT_PROMOTION=NEW_EXACT_BINDING",
);
console.log(
  "OPERATOR_PRODUCT_RECOMMENDATION_REFINEMENT_CURRENT_MAIN=REASSESSMENT_REQUIRED",
);
console.log(
  "OPERATOR_PRODUCT_RECOMMENDATION_REFINEMENT_AUTO_EXECUTION=DISABLED",
);
