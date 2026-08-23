import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const refinementPath =
  "lib/operator/contracts/OperatorRecommendationRefinementState.js";
const projectStatePath = "lib/operator/contracts/OperatorProjectState.js";
const syntheticPath =
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js";
const memoryPath = "lib/operator/runtime/IntelligenceMemoryRuntime.js";

const files = Object.fromEntries(
  await Promise.all(
    [refinementPath, projectStatePath, syntheticPath, memoryPath].map(
      async (path) => [path, await readFile(path, "utf8")],
    ),
  ),
);

function requireFragments(path, fragments) {
  const source = files[path];
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
  }
}

requireFragments(refinementPath, [
  "previous_description:",
  "sourceDescription || null",
  "previousDescription &&",
  "previousDescription !== text(recommendation.description, 600)",
  "!sourceRecommendationId || !sourceFocus || !focus",
]);

requireFragments(projectStatePath, [
  "function decisionSupersession(value)",
  'hasOwn(source, "last_decision_supersession")',
  "decisionSupersession(source.last_decision_supersession)",
  "last_decision_supersession: nextDecisionSupersession",
]);

requireFragments(syntheticPath, [
  "function projectStateWithRefinementDecision(",
  "refinement,",
  "const previousDescription = text(refinement?.previous_description, 430)",
  "const previousDecision = previousDescription",
  "remainingDecisions = previousDecision",
  "item.toLowerCase() !== previousDecision.toLowerCase()",
  'source: "product_engineering_recommendation_refinement"',
  "last_decision_supersession: supersession",
  "nextRecommendation,\n    refinement,",
]);

requireFragments(memoryPath, [
  "PRODUCT_ENGINEERING_REFINEMENT_SUPERSESSION_SOURCE",
  '"product_engineering_recommendation_refinement"',
  "function productDecisionSupersession(previousState = {}, nextState = {})",
  "const marker = object(next.last_decision_supersession)",
  "const replacementIsCurrent = uniqueStrings(next.decisions).some",
  "decisionSupersessionSignature(previous.last_decision_supersession)",
  "decisionSupersessionSignature(marker)",
  "const decisionSupersession = productDecisionSupersession(previous, next)",
  'type: "decision"',
  "content: decisionSupersession.previous",
  'memoryKey(\n      "decision",\n      decisionSupersession.replacement,',
  "supersededBy: replacementMemory?.id || null",
  "row?.forgotten_at || row?.superseded_at || row?.superseded_by",
]);

const syntheticSource = files[syntheticPath];
const projectFunctionStart = syntheticSource.indexOf(
  "function projectStateWithRefinementDecision(",
);
const projectFunctionEnd = syntheticSource.indexOf(
  "function refinementLocalTurn",
  projectFunctionStart,
);
assert.ok(projectFunctionStart >= 0 && projectFunctionEnd > projectFunctionStart);
const projectFunction = syntheticSource.slice(
  projectFunctionStart,
  projectFunctionEnd,
);
for (const forbidden of [
  "runOperatorTurn(",
  "executeUbteCapability",
  "supabaseAdmin",
  "platform.code_ai_autonomous.execute",
  "platform.code_ai_commit.execute",
]) {
  assert.ok(
    !projectFunction.includes(forbidden),
    `project decision supersession must not execute through ${forbidden}`,
  );
}

const memorySource = files[memoryPath];
const supersessionStart = memorySource.indexOf(
  "function productDecisionSupersession(previousState = {}, nextState = {})",
);
const retireStart = memorySource.indexOf(
  "async function retireMemoryByKey",
  supersessionStart,
);
assert.ok(supersessionStart >= 0 && retireStart > supersessionStart);
const supersessionSource = memorySource.slice(supersessionStart, retireStart);
assert.ok(
  supersessionSource.includes(
    "PRODUCT_ENGINEERING_REFINEMENT_SUPERSESSION_SOURCE",
  ),
  "only the registered Product Engineering refinement source may retire a decision",
);
assert.ok(
  supersessionSource.includes("replacementIsCurrent"),
  "replacement must still be a current project decision",
);
assert.ok(
  supersessionSource.includes("decisionSupersessionSignature"),
  "the same supersession marker must not replay on later turns",
);

const {
  agreementWithProductEngineeringRecommendationRefinement,
  operatorRecommendationRefinementFromAgreementState,
} = await import(
  "@/lib/operator/contracts/OperatorRecommendationRefinementState"
);
const { normalizeOperatorProjectState } = await import(
  "@/lib/operator/contracts/OperatorProjectState"
);

const sourceRecommendation = {
  recommendation_id: "operator_recommendation_source_1",
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run the original repository-grounded Product Engineering cycle",
  payload: { focus: "original repository-grounded focus" },
};
const baseAgreement = {
  recommended_action: sourceRecommendation,
};
const proposed = agreementWithProductEngineeringRecommendationRefinement(
  baseAgreement,
  {
    recommendation: sourceRecommendation,
    proposedFocus: "refined repository-grounded focus",
  },
);
const refinement = operatorRecommendationRefinementFromAgreementState(proposed);
assert.ok(refinement, "described source recommendation must create refinement");
assert.equal(
  refinement.previous_description,
  sourceRecommendation.description,
  "refinement must carry the exact prior recommendation description",
);

const sourceWithoutDescription = {
  recommendation_id: "operator_recommendation_legacy_1",
  capability_key: "platform.product_engineering_cycle.execute",
  payload: { focus: "legacy repository-grounded focus" },
};
const legacyAgreement = {
  recommended_action: sourceWithoutDescription,
};
const legacyProposed = agreementWithProductEngineeringRecommendationRefinement(
  legacyAgreement,
  {
    recommendation: sourceWithoutDescription,
    proposedFocus: "legacy-compatible refined focus",
  },
);
const legacyRefinement = operatorRecommendationRefinementFromAgreementState(
  legacyProposed,
);
assert.ok(
  legacyRefinement,
  "missing description must not break an otherwise exact legacy refinement",
);
assert.equal(legacyRefinement.previous_description, null);

const previousDecision =
  "Proceed with Run the original repository-grounded Product Engineering cycle";
const replacementDecision =
  "Proceed with Run one fresh Product Engineering Cycle prioritizing: refined repository-grounded focus";
const normalizedState = normalizeOperatorProjectState({
  objective: "refined repository-grounded focus",
  decisions: [replacementDecision],
  last_decision_supersession: {
    previous: previousDecision,
    replacement: replacementDecision,
    source: "product_engineering_recommendation_refinement",
  },
});
assert.deepEqual(normalizedState.last_decision_supersession, {
  previous: previousDecision,
  replacement: replacementDecision,
  source: "product_engineering_recommendation_refinement",
});
assert.deepEqual(normalizedState.decisions, [replacementDecision]);

const invalidSupersession = normalizeOperatorProjectState({
  objective: "refined repository-grounded focus",
  last_decision_supersession: {
    previous: previousDecision,
    replacement: previousDecision,
    source: "product_engineering_recommendation_refinement",
  },
});
assert.equal(
  invalidSupersession.last_decision_supersession,
  null,
  "same-decision markers must fail closed",
);

console.log("OPERATOR_PRODUCT_REFINEMENT_DECISION_MEMORY_AUDIT=PASS");
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_DECISION_PROJECT_STATE=EXACT_OLD_REMOVED_NEW_CURRENT",
);
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_DECISION_SUPERSESSION=EXPLICIT_SOURCE_BOUND_MARKER",
);
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_DECISION_MEMORY=OLD_EXACT_RETIRED_AFTER_NEW_LEARNED",
);
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_DECISION_RECALL=SUPERSEDED_OLD_EXCLUDED",
);
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_DECISION_REPLAY=DISABLED",
);
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_DECISION_COMPATIBILITY=MISSING_DESCRIPTION_ALLOWED",
);
