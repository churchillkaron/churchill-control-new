import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  agreementWithProductEngineeringRecommendationRefinement,
  operatorRecommendationRefinementFromAgreementState,
  operatorRecommendationRefinementMatchesSourceRecommendation,
} = await import(
  "@/lib/operator/contracts/OperatorRecommendationRefinementState"
);
const {
  agreementWithOperatorRecommendation,
  clearOperatorRecommendation,
  operatorRecommendationFromAgreementState,
} = await import("@/lib/operator/contracts/OperatorRecommendationState");

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

const originalRecommendation = {
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run original Product Engineering focus",
  payload: { focus: "original repository-grounded focus" },
  objective: "original repository-grounded focus",
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
  ...clearOperatorRecommendation(originalBound),
  recommended_action: originalPersisted,
};
const proposed = agreementWithProductEngineeringRecommendationRefinement(
  pausedOriginal,
  {
    recommendation: originalPersisted,
    proposedFocus: "refined priority context",
  },
);
const liveRefinement = operatorRecommendationRefinementFromAgreementState(proposed);
assert.ok(liveRefinement, "matching source recommendation must keep refinement valid");
assert.equal(
  operatorRecommendationRefinementMatchesSourceRecommendation(
    proposed,
    liveRefinement,
  ),
  true,
);

const supersededId = copy(proposed);
supersededId.recommended_action.recommendation_id =
  "operator_recommendation_superseding_direction";
assert.equal(
  operatorRecommendationRefinementMatchesSourceRecommendation(supersededId),
  false,
  "different recommendation id must invalidate the refinement source binding",
);
assert.equal(
  operatorRecommendationRefinementFromAgreementState(supersededId),
  null,
  "stale refinement must fail closed when recommendation id changes",
);

const supersededFocus = copy(proposed);
supersededFocus.recommended_action.payload.focus =
  "newer repository-grounded direction";
assert.equal(
  operatorRecommendationRefinementMatchesSourceRecommendation(supersededFocus),
  false,
  "different source focus must invalidate the refinement source binding",
);
assert.equal(
  operatorRecommendationRefinementFromAgreementState(supersededFocus),
  null,
  "stale refinement must fail closed when source focus changes",
);

const missingSource = copy(proposed);
delete missingSource.recommended_action;
assert.equal(
  operatorRecommendationRefinementFromAgreementState(missingSource),
  null,
  "refinement without its source recommendation must never be promotable",
);

const unboundSource = agreementWithProductEngineeringRecommendationRefinement(
  {},
  {
    recommendation: {
      capability_key: "platform.product_engineering_cycle.execute",
      payload: { focus: "unbound focus" },
    },
    proposedFocus: "should not persist",
  },
);
assert.equal(
  unboundSource.recommendation_refinement,
  undefined,
  "new refinement requires a bound source recommendation id and focus",
);

console.log("OPERATOR_PRODUCT_REFINEMENT_SOURCE_BINDING_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_REFINEMENT_SOURCE_ID=EXACT_REQUIRED");
console.log("OPERATOR_PRODUCT_REFINEMENT_SOURCE_FOCUS=EXACT_REQUIRED");
console.log("OPERATOR_PRODUCT_REFINEMENT_SUPERSEDED=FAIL_CLOSED_NO_PROMOTION");
console.log("OPERATOR_PRODUCT_REFINEMENT_UNBOUND_SOURCE=REJECTED");
