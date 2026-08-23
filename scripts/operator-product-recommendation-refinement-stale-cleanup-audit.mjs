import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const syntheticPath =
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js";
const refinementPath =
  "lib/operator/contracts/OperatorRecommendationRefinementState.js";
const recommendationPath =
  "lib/operator/contracts/OperatorRecommendationState.js";

const files = Object.fromEntries(
  await Promise.all(
    [syntheticPath, refinementPath, recommendationPath].map(async (path) => [
      path,
      await readFile(path, "utf8"),
    ]),
  ),
);

function requireFragments(path, fragments) {
  const source = files[path];
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
  }
}

requireFragments(syntheticPath, [
  "function storedRecommendationRefinementState",
  '"recommendation_refinement"',
  "storedRefinement.stored && !storedRefinement.valid",
  "clearOperatorRecommendationRefinement(originalAgreementState)",
  "function supersededRecommendationRefinementTurn",
  'status: "SUPERSEDED_CLEARED"',
  "stale_refinement_cleared: true",
  "shorthand_consumed_without_authority: true",
  "current_recommendation_unchanged: true",
  "recommendationRefinementDecisionClass(options.message)",
  "return staleTurn",
  "I did not treat your shorthand reply as approval, selection, execution, resume, or cancellation of any newer action.",
]);

const syntheticSource = files[syntheticPath];
const runStart = syntheticSource.indexOf(
  "export async function runSyntheticIntelligenceTurn",
);
const staleDetection = syntheticSource.indexOf(
  "const staleRefinementStored = storedRefinement.stored && !storedRefinement.valid",
  runStart,
);
const staleGuard = syntheticSource.indexOf(
  "staleRefinementStored &&",
  staleDetection,
);
const operatorCall = syntheticSource.indexOf(
  "const operatorResult = await runOperatorTurn",
  runStart,
);
assert.ok(runStart >= 0, "Synthetic Intelligence turn must exist");
assert.ok(
  staleDetection > runStart && staleDetection < operatorCall,
  "stale refinement detection must happen before governed Operator execution",
);
assert.ok(
  staleGuard > staleDetection && staleGuard < operatorCall,
  "stale shorthand guard must happen before governed Operator execution",
);

const staleTurnStart = syntheticSource.indexOf(
  "function supersededRecommendationRefinementTurn",
);
const staleTurnEnd = syntheticSource.indexOf(
  "function preflightRecommendationRefinement",
  staleTurnStart,
);
assert.ok(staleTurnStart >= 0 && staleTurnEnd > staleTurnStart);
const staleTurnSource = syntheticSource.slice(staleTurnStart, staleTurnEnd);
for (const forbidden of [
  "runOperatorTurn(",
  "executeUbteCapability",
  "platform.code_ai_autonomous.execute",
  "platform.code_ai_commit.execute",
  "agreementWithOperatorRecommendation(",
  "clearOperatorRecommendation(",
]) {
  assert.ok(
    !staleTurnSource.includes(forbidden),
    `stale refinement cleanup turn must not execute/rebind through ${forbidden}`,
  );
}

requireFragments(refinementPath, [
  "operatorRecommendationRefinementMatchesSourceRecommendation",
  "previousRecommendationId !== currentRecommendationId",
  "previousFocus !== currentFocus",
  "operatorRecommendationRefinementFromAgreementState",
  "? refinement",
  ": null",
]);

const {
  agreementWithOperatorRecommendation,
  operatorRecommendationFromAgreementState,
} = await import("@/lib/operator/contracts/OperatorRecommendationState");
const {
  agreementWithProductEngineeringRecommendationRefinement,
  clearOperatorRecommendationRefinement,
  operatorRecommendationRefinementFromAgreementState,
} = await import(
  "@/lib/operator/contracts/OperatorRecommendationRefinementState"
);

const originalRecommendation = {
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run original Product Engineering direction",
  payload: { focus: "original focus" },
  objective: "original focus",
  source: "verified_post_commit_product_reassessment",
};
const originalBound = agreementWithOperatorRecommendation(
  {},
  originalRecommendation,
  { objective: originalRecommendation.objective },
);
const originalPersisted = operatorRecommendationFromAgreementState(originalBound);
assert.ok(originalPersisted?.recommendation_id);

const pausedOriginal = {
  recommended_action: originalPersisted,
};
const proposed = agreementWithProductEngineeringRecommendationRefinement(
  pausedOriginal,
  {
    recommendation: originalPersisted,
    proposedFocus: "new proposed focus",
  },
);
assert.ok(
  operatorRecommendationRefinementFromAgreementState(proposed),
  "matching source recommendation must keep refinement valid",
);

const newerRecommendation = {
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run newer Product Engineering direction",
  payload: { focus: "newer focus" },
  objective: "newer focus",
  source: "verified_post_commit_product_reassessment",
};
const newerBound = agreementWithOperatorRecommendation(
  {},
  newerRecommendation,
  { objective: newerRecommendation.objective },
);
const newerPersisted = operatorRecommendationFromAgreementState(newerBound);
assert.ok(newerPersisted?.recommendation_id);
assert.notEqual(
  newerPersisted.recommendation_id,
  originalPersisted.recommendation_id,
);

const staleProposal = {
  ...proposed,
  recommended_action: newerPersisted,
};
assert.equal(
  operatorRecommendationRefinementFromAgreementState(staleProposal),
  null,
  "superseded refinement must fail closed",
);

const cleaned = clearOperatorRecommendationRefinement(staleProposal);
assert.equal(cleaned.recommendation_refinement, undefined);
assert.equal(
  cleaned.recommended_action?.recommendation_id,
  newerPersisted.recommendation_id,
  "cleanup must preserve the newer recommendation",
);
assert.deepEqual(
  cleaned.recommended_action?.payload,
  newerPersisted.payload,
  "cleanup must preserve the newer recommendation payload",
);

console.log("OPERATOR_PRODUCT_REFINEMENT_STALE_CLEANUP_AUDIT=PASS");
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_STALE_CLEANUP=STALE_PROPOSAL_REMOVED",
);
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_STALE_SHORTHAND=CONSUMED_WITHOUT_AUTHORITY",
);
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_NEWER_RECOMMENDATION=PRESERVED_UNCHANGED",
);
console.log(
  "OPERATOR_PRODUCT_REFINEMENT_STALE_EXECUTION=BLOCKED_BEFORE_OPERATOR_CORE",
);
