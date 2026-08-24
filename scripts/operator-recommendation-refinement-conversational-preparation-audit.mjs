import assert from "node:assert/strict";
import {
  continueRecommendationRefinementPreparationFromMessage,
  prepareRecommendationRefinement,
} from "../lib/operator/runtime/OperatorRecommendationRefinementPreparationRuntime.js";

const organizationId = "63e6b0d7-9882-4db4-a2c3-e695487ba21d";
const customerId = "2f1c9f57-5917-4b26-84d1-086de4d86f79";
const invoicePermission = "finance.customer_invoice.manage";
const actor = {
  permissions: [invoicePermission],
  role: "ACCOUNTANT",
};
const capability = {
  key: "finance.customer_invoice.write",
  mode: "write",
  name: "Create customer invoice",
  description: "Create customer invoice",
  operator_aliases: ["customer invoice"],
  operator_enabled: true,
  permissions: [invoicePermission],
  requires_confirmation: true,
  input_schema: {
    type: "object",
    properties: {
      organization_id: { type: "string", format: "uuid" },
      customer_id: { type: "string", format: "uuid", title: "Customer" },
      amount: { type: "number", title: "Amount" },
      description: { type: "string" },
    },
    required: ["organization_id", "customer_id", "amount", "description"],
  },
};
const proposal = {
  proposal_id: "refinement_conversational_audit",
  proposal_text: "Create a customer invoice for the refined direction",
  previous_capability_key: "platform.previous.write",
  selection_origin: "REFINEMENT_PROPOSAL",
};
const initial = prepareRecommendationRefinement({
  proposal,
  capabilities: [capability],
  context: { organizationId },
  ...actor,
});
assert.equal(initial.stage, "INPUT_CLARIFICATION_REQUIRED");
assert.deepEqual(initial.input_state?.missing_required_fields, [
  "customer_id",
  "amount",
]);
assert.equal(initial.clarification.required, true);
assert.equal(initial.execution_authorized, false);
assert.equal(initial.pending_execution_created, false);
assert.equal(initial.autonomous_run_created, false);

const freeText = continueRecommendationRefinementPreparationFromMessage({
  proposal,
  inputState: initial.input_state,
  capability,
  clarification: initial.clarification,
  message: `use ${customerId} and about 1500`,
  context: { organizationId },
  ...actor,
});
assert.equal(freeText.stage, "INPUT_ANSWER_CLARIFICATION_REQUIRED");
assert.equal(freeText.extraction.accepted, false);
assert.deepEqual(freeText.extraction.answers, {});
assert.equal(freeText.ready_for_governed_binding, false);
assert.equal(freeText.execution_authorized, false);

const partial = continueRecommendationRefinementPreparationFromMessage({
  proposal,
  inputState: initial.input_state,
  capability,
  clarification: initial.clarification,
  message: `Customer: ${customerId}`,
  context: { organizationId },
  ...actor,
});
assert.equal(partial.stage, "INPUT_CLARIFICATION_REQUIRED");
assert.equal(partial.extraction.accepted, true);
assert.equal(partial.answer_result.accepted, true);
assert.deepEqual(partial.input_state?.missing_required_fields, ["amount"]);
assert.equal(partial.ready_for_governed_binding, false);
assert.equal(partial.execution_authorized, false);
assert.equal(partial.pending_execution_created, false);
assert.equal(partial.autonomous_run_created, false);

const revokedAfterPartial = continueRecommendationRefinementPreparationFromMessage({
  proposal,
  inputState: partial.input_state,
  capability,
  clarification: partial.clarification,
  message: "Amount = 1500",
  context: { organizationId },
  permissions: [],
  role: actor.role,
});
assert.equal(
  revokedAfterPartial.stage,
  "ACTOR_POLICY_CHANGED_DURING_CLARIFICATION",
);
assert.equal(revokedAfterPartial.actor_policy.allowed, false);
assert.equal(revokedAfterPartial.ready_for_governed_binding, false);
assert.equal(revokedAfterPartial.execution_authorized, false);
assert.equal(revokedAfterPartial.pending_execution_created, false);
assert.equal(revokedAfterPartial.autonomous_run_created, false);

const completed = continueRecommendationRefinementPreparationFromMessage({
  proposal,
  inputState: partial.input_state,
  capability,
  clarification: partial.clarification,
  message: "Amount = 1500",
  context: { organizationId },
  ...actor,
});
assert.equal(completed.stage, "READY_FOR_GOVERNED_BINDING");
assert.equal(completed.extraction.accepted, true);
assert.equal(completed.answer_result.complete, true);
assert.equal(completed.ready_for_governed_binding, true);
assert.deepEqual(completed.recommendation?.payload, {
  description: proposal.proposal_text,
  customer_id: customerId,
  amount: 1500,
});
assert.equal(completed.recommendation_binding_created, false);
assert.equal(completed.pending_execution_created, false);
assert.equal(completed.autonomous_run_created, false);
assert.equal(completed.execution_authorized, false);
assert.equal(completed.old_payload_reused, false);

const extraField = continueRecommendationRefinementPreparationFromMessage({
  proposal,
  inputState: initial.input_state,
  capability,
  clarification: initial.clarification,
  message: `Customer: ${customerId}; currency: THB`,
  context: { organizationId },
  ...actor,
});
assert.equal(extraField.stage, "INPUT_ANSWER_CLARIFICATION_REQUIRED");
assert.equal(extraField.extraction.accepted, false);
assert.equal(
  extraField.extraction.rejected_segments.some(
    (item) => item.reason === "FIELD_NOT_REQUESTED",
  ),
  true,
);
assert.equal(extraField.ready_for_governed_binding, false);
assert.equal(extraField.execution_authorized, false);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATIONAL_PREPARATION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATION_FREE_TEXT=NOT_INFERRED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATION_PARTIAL=CLARIFICATION_PRESERVED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATION_PERMISSION_REVOKED=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATION_COMPLETE=PREBINDING_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATION_EXTRA_FIELDS=REJECTED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATION_BINDING=NOT_CREATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATION_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CONVERSATION_EXECUTION=NONE");
