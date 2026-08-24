import assert from "node:assert/strict";
import {
  agreementWithRecommendationRefinementDecision,
  classifyRecommendationRefinementReply,
  recommendationRefinementProposalFromAgreementState,
} from "../lib/operator/runtime/OperatorRecommendationRefinement.js";

const legacyProposal = {
  proposal_id: "operator_refinement_legacy_restore_audit",
  proposal_kind: "recommendation_refinement",
  status: "PROPOSED",
  proposal_text: "What if we use the newer direction instead?",
  previous_recommendation_id: "operator_recommendation_legacy_restore_old",
  previous_capability_key: "platform.product_engineering_cycle.execute",
  authorization_effect: "NONE",
  execution_authorized: false,
  pending_execution_created: false,
  autonomous_run_created: false,
  requires_explicit_decision: true,
  source: "operator_recommendation_refinement",
  created_at: new Date().toISOString(),
};

const exactOldContext = {
  recommendation_id: legacyProposal.previous_recommendation_id,
  capability_key: legacyProposal.previous_capability_key,
  description: "Use the original bounded engineering objective",
  payload: { focus: "OLD_PAYLOAD_MUST_NEVER_RETURN" },
};

const recoverableLegacyAgreement = {
  marker: "preserve",
  recommended_action: exactOldContext,
  recommendation_refinement_proposal: legacyProposal,
};
assert.equal(
  classifyRecommendationRefinementReply({
    message: "keep the original",
    agreementState: recoverableLegacyAgreement,
    proposal: legacyProposal,
  }),
  "restore_original",
  "legacy restore may use exact preserved identity context",
);
const restored = agreementWithRecommendationRefinementDecision(
  recoverableLegacyAgreement,
  {
    outcome: "restore_original",
    message: "keep the original",
    proposal: legacyProposal,
  },
);
const restoredProposal = recommendationRefinementProposalFromAgreementState(restored);
assert.equal(restoredProposal?.status, "SELECTED");
assert.equal(
  restoredProposal?.selection_origin,
  "ORIGINAL_RECOMMENDATION_CONTEXT",
);
assert.equal(restoredProposal?.proposal_text, exactOldContext.description);
assert.equal(restoredProposal?.authorization_effect, "NONE");
assert.equal(restoredProposal?.execution_authorized, false);
assert.equal(restoredProposal?.pending_execution_created, false);
assert.equal(restoredProposal?.autonomous_run_created, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(restoredProposal || {}, "payload"),
  false,
  "legacy restoration must recover description only, never old payload",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(restored, "pending_execution"),
  false,
);
assert.equal(
  Object.prototype.hasOwnProperty.call(restored, "autonomous_run"),
  false,
);

const missingContextAgreement = {
  marker: "preserve",
  recommendation_refinement_proposal: legacyProposal,
};
assert.equal(
  classifyRecommendationRefinementReply({
    message: "keep the original",
    agreementState: missingContextAgreement,
    proposal: legacyProposal,
  }),
  "reject",
  "unprovable legacy restoration must degrade to plain rejection",
);
const missingContextRestore = agreementWithRecommendationRefinementDecision(
  missingContextAgreement,
  {
    outcome: "restore_original",
    message: "keep the original",
    proposal: legacyProposal,
  },
);
assert.equal(
  recommendationRefinementProposalFromAgreementState(missingContextRestore)?.status,
  "PROPOSED",
  "state helper must not claim restoration without exact description evidence",
);

for (const mismatch of [
  {
    ...exactOldContext,
    recommendation_id: "wrong-recommendation-id",
  },
  {
    ...exactOldContext,
    capability_key: "platform.other.execute",
  },
  {
    recommendation_id: exactOldContext.recommendation_id,
    capability_key: exactOldContext.capability_key,
    description: "",
    reason: "",
  },
]) {
  const agreement = {
    marker: "preserve",
    recommended_action: mismatch,
    recommendation_refinement_proposal: legacyProposal,
  };
  assert.equal(
    classifyRecommendationRefinementReply({
      message: "keep the original",
      agreementState: agreement,
      proposal: legacyProposal,
    }),
    "reject",
    "legacy restoration must fail closed on identity/description mismatch",
  );
}

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_LEGACY_RESTORE_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_LEGACY_RESTORE=EXACT_CONTEXT_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_LEGACY_RESTORE_IDENTITY=RECOMMENDATION_AND_CAPABILITY_MATCH");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_LEGACY_RESTORE_OLD_PAYLOAD=NEVER_RECOVERED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_LEGACY_RESTORE_UNPROVABLE=PLAIN_REJECTION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_LEGACY_RESTORE_EXECUTION=NONE");
