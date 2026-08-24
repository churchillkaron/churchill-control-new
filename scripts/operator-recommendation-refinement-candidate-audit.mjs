import assert from "node:assert/strict";
import {
  createRecommendationCandidateFromRefinementRevalidation,
} from "../lib/operator/runtime/OperatorRecommendationRefinementCandidate.js";

const capability = {
  key: "finance.customer_invoice.write",
  name: "Create customer invoice",
  description: "Create a customer invoice",
};
const revalidation = {
  ready_for_governed_recommendation: true,
  current_capability_revalidated: true,
  requires_fresh_recommendation_binding: true,
  authorization_effect: "NONE",
  execution_authorized: false,
  pending_execution_created: false,
  autonomous_run_created: false,
  old_payload_reused: false,
  capability_key: capability.key,
  payload: {
    customer_id: "2f1c9f57-5917-4b26-84d1-086de4d86f79",
    amount: 1500,
    description: "Refined invoice",
  },
};
const proposal = {
  proposal_text: "Create the refined invoice after current schema revalidation",
};

const candidate = createRecommendationCandidateFromRefinementRevalidation({
  revalidation,
  capability,
  proposal,
});
assert.ok(candidate);
assert.equal(candidate.candidate_kind, "refinement_revalidated_recommendation_candidate");
assert.equal(candidate.capability_key, capability.key);
assert.deepEqual(candidate.payload, revalidation.payload);
assert.equal(candidate.source, "selected_refinement_current_capability_revalidation");
assert.equal(candidate.authorization_effect, "NONE");
assert.equal(candidate.execution_authorized, false);
assert.equal(candidate.recommendation_binding_created, false);
assert.equal(candidate.pending_execution_created, false);
assert.equal(candidate.autonomous_run_created, false);
assert.equal(candidate.old_payload_reused, false);
assert.equal(candidate.requires_fresh_recommendation_binding, true);
for (const forbidden of [
  "recommendation_id",
  "run_id",
  "pending_execution",
  "autonomous_run",
]) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(candidate, forbidden),
    false,
    `candidate must not contain authority field ${forbidden}`,
  );
}

for (const [field, unsafeValue] of [
  ["ready_for_governed_recommendation", false],
  ["current_capability_revalidated", false],
  ["requires_fresh_recommendation_binding", false],
  ["authorization_effect", "EXECUTE"],
  ["execution_authorized", true],
  ["pending_execution_created", true],
  ["autonomous_run_created", true],
  ["old_payload_reused", true],
]) {
  assert.equal(
    createRecommendationCandidateFromRefinementRevalidation({
      revalidation: { ...revalidation, [field]: unsafeValue },
      capability,
      proposal,
    }),
    null,
    `candidate must fail closed when ${field} is unsafe`,
  );
}

assert.equal(
  createRecommendationCandidateFromRefinementRevalidation({
    revalidation,
    capability: { ...capability, key: "finance.vendor_bill.write" },
    proposal,
  }),
  null,
  "candidate must require exact current capability identity",
);
assert.equal(
  createRecommendationCandidateFromRefinementRevalidation({
    revalidation: { ...revalidation, capability_key: "" },
    capability,
    proposal,
  }),
  null,
);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CANDIDATE_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CANDIDATE_CAPABILITY=EXACT_REVALIDATED_IDENTITY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CANDIDATE_BINDING=NOT_CREATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CANDIDATE_PENDING=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CANDIDATE_RUN=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CANDIDATE_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CANDIDATE_EXECUTION=NONE");
