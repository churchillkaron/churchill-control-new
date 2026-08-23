import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const recommendationPath = "lib/operator/contracts/OperatorRecommendationState.js";
const turnPath = "lib/operator/runtime/OperatorTurnRuntime.js";
const classifierPath = "lib/operator/runtime/OperatorHumanDecisionClassifier.js";

const [recommendationSource, turnSource, classifierSource] = await Promise.all([
  readFile(recommendationPath, "utf8"),
  readFile(turnPath, "utf8"),
  readFile(classifierPath, "utf8"),
]);

function requireFragments(path, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
  }
}

requireFragments(recommendationPath, recommendationSource, [
  "function recommendationId()",
  "recommendation_id: text(candidate.recommendation_id, 160) || null",
  "operatorRecommendationMatchesPendingExecution",
  "canonicalRecommendationValue",
  "sameRecommendationValue",
  "recommendationBindingId !== pendingBindingId",
  "text(pending.capability_key, 240) !== normalized.capability_key",
  "sameRecommendationValue(pending.payload, normalized.payload)",
  'text(run.run_kind, 40).toLowerCase() !== "single_action"',
  '"cancelled", "completed", "superseded"',
  'text(step?.id) === "requested_action"',
  "text(requestedAction.capability_key, 240) !== normalized.capability_key",
  "requestedAction.payload",
  "recommendation_id: boundRecommendation.recommendation_id",
  "[RECOMMENDATION_KEY]: boundRecommendation",
  "const exactBinding = Boolean(",
  "if (!recommendation || !exactBinding) return next",
  "delete next.pending_execution",
  "delete next.autonomous_run",
]);

requireFragments(turnPath, turnSource, [
  "operatorRecommendationMatchesPendingExecution",
  "exactRecommendationBinding",
  "recommendation && !exactRecommendationBinding",
  'pending: true,\n      recommendation: true',
  'return "recommendation_binding_mismatch"',
  "recommendationBindingMismatchTurn",
  'reason: "RECOMMENDATION_PENDING_EXECUTION_MISMATCH"',
  "execution_authorized: false",
  "state_preserved: true",
  'replyClass === "recommendation_binding_mismatch"',
]);

const mismatchGuardStart = turnSource.indexOf(
  'if (recommendation && replyClass === "recommendation_binding_mismatch")',
);
const coreExecutionStart = turnSource.indexOf(
  "const coreResult = await runOperatorTurnCore",
  mismatchGuardStart,
);
assert.ok(mismatchGuardStart >= 0, "binding mismatch guard must exist");
assert.ok(
  coreExecutionStart > mismatchGuardStart,
  "binding mismatch guard must run before core execution",
);
const mismatchGuard = turnSource.slice(mismatchGuardStart, coreExecutionStart);
assert.ok(
  mismatchGuard.includes("return recommendationBindingMismatchTurn"),
  "binding mismatch must return before core execution",
);
assert.ok(
  !mismatchGuard.includes("runOperatorTurnCore"),
  "binding mismatch must not execute operator core",
);

const mismatchTurnStart = turnSource.indexOf(
  "function recommendationBindingMismatchTurn",
);
const requiredFieldsStart = turnSource.indexOf(
  "function requiredFields",
  mismatchTurnStart,
);
const mismatchTurnSource = turnSource.slice(
  mismatchTurnStart,
  requiredFieldsStart,
);
for (const forbidden of [
  "runOperatorTurnCore",
  "executeUbteCapability",
  "platform.code_ai_autonomous.execute",
  "platform.code_ai_commit.execute",
  "clearOperatorRecommendation(",
  "agreementWithOperatorRecommendation(",
]) {
  assert.ok(
    !mismatchTurnSource.includes(forbidden),
    `binding mismatch turn must preserve state and not execute/mutate through ${forbidden}`,
  );
}

requireFragments(classifierPath, classifierSource, [
  '"continue"',
  '"next"',
  '"do it"',
  "if (!pending) return null",
  "if (recommendation)",
]);

const {
  agreementWithOperatorRecommendation,
  clearOperatorRecommendation,
  operatorRecommendationFromAgreementState,
  operatorRecommendationMatchesPendingExecution,
} = await import("@/lib/operator/contracts/OperatorRecommendationState");

const recommendation = {
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run the fresh bounded engineering objective",
  payload: {
    focus: "fresh current-main objective",
    evidence: { beta: 2, alpha: 1 },
  },
  objective: "fresh current-main objective",
  source: "stale_base_current_main_reassessment",
};
const agreement = agreementWithOperatorRecommendation({}, recommendation, {
  objective: recommendation.objective,
});
const persisted = operatorRecommendationFromAgreementState(agreement);
assert.ok(
  persisted?.recommendation_id,
  "new recommendation must receive a binding id",
);
assert.equal(
  agreement.pending_execution?.recommendation_id,
  persisted.recommendation_id,
  "pending execution must carry the same binding id",
);
assert.equal(
  operatorRecommendationMatchesPendingExecution(agreement, persisted),
  true,
  "exact recommendation/pending/run binding must pass",
);

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

const wrongId = copy(agreement);
wrongId.pending_execution.recommendation_id = "operator_recommendation_other";
assert.equal(
  operatorRecommendationMatchesPendingExecution(wrongId, persisted),
  false,
);

const wrongCapability = copy(agreement);
wrongCapability.pending_execution.capability_key = "platform.other.execute";
assert.equal(
  operatorRecommendationMatchesPendingExecution(wrongCapability, persisted),
  false,
);

const wrongPayload = copy(agreement);
wrongPayload.pending_execution.payload.focus = "different objective";
assert.equal(
  operatorRecommendationMatchesPendingExecution(wrongPayload, persisted),
  false,
);
const preservedPending = copy(wrongPayload.pending_execution);
const preservedRun = copy(wrongPayload.autonomous_run);
const clearedMismatch = clearOperatorRecommendation(wrongPayload);
assert.equal(clearedMismatch.recommended_action, undefined);
assert.deepEqual(clearedMismatch.pending_execution, preservedPending);
assert.deepEqual(clearedMismatch.autonomous_run, preservedRun);

const wrongRunPayload = copy(agreement);
const wrongRunAction = wrongRunPayload.autonomous_run.planned_steps.find(
  (step) => step.id === "requested_action",
);
wrongRunAction.payload.focus = "different objective";
assert.equal(
  operatorRecommendationMatchesPendingExecution(wrongRunPayload, persisted),
  false,
);

const terminalRun = copy(agreement);
terminalRun.autonomous_run.status = "superseded";
assert.equal(
  operatorRecommendationMatchesPendingExecution(terminalRun, persisted),
  false,
);

const exactCleared = clearOperatorRecommendation(copy(agreement));
assert.equal(exactCleared.recommended_action, undefined);
assert.equal(exactCleared.pending_execution, undefined);
assert.equal(exactCleared.autonomous_run, undefined);

const legacyAgreement = copy(agreement);
delete legacyAgreement.recommended_action.recommendation_id;
delete legacyAgreement.pending_execution.recommendation_id;
const legacyRecommendation = operatorRecommendationFromAgreementState(
  legacyAgreement,
);
assert.equal(
  operatorRecommendationMatchesPendingExecution(
    legacyAgreement,
    legacyRecommendation,
  ),
  true,
  "legacy exact structural binding without ids must remain compatible",
);

console.log("OPERATOR_RECOMMENDATION_BINDING_AUDIT=PASS");
console.log(
  "OPERATOR_RECOMMENDATION_BINDING_ID=EXACT_OR_LEGACY_STRUCTURAL_MATCH",
);
console.log("OPERATOR_RECOMMENDATION_BINDING_CAPABILITY=EXACT");
console.log("OPERATOR_RECOMMENDATION_BINDING_PAYLOAD=EXACT");
console.log(
  "OPERATOR_RECOMMENDATION_BINDING_RUN=EXACT_SINGLE_ACTION_NONTERMINAL",
);
console.log(
  "OPERATOR_RECOMMENDATION_BINDING_MISMATCH=NO_SHORTHAND_EXECUTION",
);
console.log("OPERATOR_RECOMMENDATION_BINDING_STATE=PRESERVED_ON_MISMATCH");
console.log("OPERATOR_RECOMMENDATION_BINDING_CLEAR=EXACT_BINDING_ONLY");
