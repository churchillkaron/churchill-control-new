import assert from "node:assert/strict";
import {
  agreementWithRecommendationRefinementDecision,
  recommendationRefinementProposalFromAgreementState,
  createRecommendationRefinementProposal,
} from "../lib/operator/runtime/OperatorRecommendationRefinement.js";

const previousRecommendation = {
  recommendation_id: "old_recommendation",
  capability_key: "platform.old.write",
  description: "Old action",
};

const proposal = createRecommendationRefinementProposal({
  message: "What if we use the safer new direction instead?",
  recommendation: previousRecommendation,
});

const selected = recommendationRefinementProposalFromAgreementState(
  agreementWithRecommendationRefinementDecision(
    {
      recommendation_refinement_proposal: proposal,
      recommended_action: previousRecommendation,
    },
    { outcome: "select", message: "yes, I prefer that", proposal },
  ),
);

assert.equal(selected.status, "SELECTED");
assert.equal(selected.previous_capability_key, null);
assert.equal(selected.previous_recommendation_id, previousRecommendation.recommendation_id);
assert.equal(selected.selection_origin, "REFINEMENT_PROPOSAL");

const restored = recommendationRefinementProposalFromAgreementState(
  agreementWithRecommendationRefinementDecision(
    {
      recommendation_refinement_proposal: proposal,
      recommended_action: previousRecommendation,
    },
    { outcome: "restore_original", message: "keep the original", proposal },
  ),
);

assert.equal(restored.selection_origin, "ORIGINAL_RECOMMENDATION_CONTEXT");
assert.equal(restored.previous_capability_key, previousRecommendation.capability_key);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_ISOLATION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTED_ALTERNATIVE_CAPABILITY=HIDDEN");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_ORIGINAL_CAPABILITY=PRESERVED");
