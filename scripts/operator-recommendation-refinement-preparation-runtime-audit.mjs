import assert from "node:assert/strict";
import {
  continueRecommendationRefinementPreparation,
  prepareRecommendationRefinement,
} from "../lib/operator/runtime/OperatorRecommendationRefinementPreparationRuntime.js";

const organizationId = "63e6b0d7-9882-4db4-a2c3-e695487ba21d";
const customerId = "2f1c9f57-5917-4b26-84d1-086de4d86f79";
const engineeringPermission = "platform.product_engineering.manage";
const invoicePermission = "finance.customer_invoice.manage";
const legacyPermission = "platform.legacy.manage";

const oldCapability = {
  key: "platform.legacy.write",
  mode: "write",
  name: "Legacy action",
  description: "Run legacy action",
  operator_aliases: ["legacy action"],
  permissions: [legacyPermission],
  operator_enabled: true,
  requires_confirmation: true,
  input_schema: { type: "object", properties: {}, required: [] },
};
const engineeringCapability = {
  key: "platform.product_engineering_cycle.execute",
  mode: "write",
  name: "Product engineering cycle",
  description: "Run product engineering cycle",
  operator_aliases: ["product engineering cycle", "engineering objective"],
  permissions: [engineeringPermission],
  operator_enabled: true,
  requires_confirmation: true,
  input_schema: {
    type: "object",
    properties: { focus: { type: "string" } },
    required: ["focus"],
  },
};
const invoiceCapability = {
  key: "finance.customer_invoice.write",
  mode: "write",
  name: "Create customer invoice",
  description: "Create customer invoice",
  operator_aliases: ["customer invoice"],
  permissions: [invoicePermission],
  operator_enabled: true,
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

const immediate = prepareRecommendationRefinement({
  proposal: {
    proposal_id: "refinement_immediate",
    proposal_text: "Run the product engineering cycle for this engineering objective",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [oldCapability, engineeringCapability],
  permissions: [engineeringPermission],
  context: {},
});
assert.equal(immediate.stage, "READY_FOR_GOVERNED_BINDING");
assert.equal(immediate.ready_for_governed_binding, true);
assert.equal(immediate.capability?.key, engineeringCapability.key);
assert.equal(immediate.actor_policy_filtered_capability_count, 1);
assert.equal(immediate.binding_preflight?.actor_policy?.allowed, true);
assert.deepEqual(immediate.recommendation?.payload, {
  focus: "Run the product engineering cycle for this engineering objective",
});
assert.equal(immediate.authorization_effect, "NONE");
assert.equal(immediate.execution_authorized, false);
assert.equal(immediate.recommendation_binding_created, false);
assert.equal(immediate.pending_execution_created, false);
assert.equal(immediate.autonomous_run_created, false);
assert.equal(immediate.old_payload_reused, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(immediate.recommendation || {}, "recommendation_id"),
  false,
);

const needsInput = prepareRecommendationRefinement({
  proposal: {
    proposal_id: "refinement_invoice",
    proposal_text: "Create a customer invoice for the refined direction",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [oldCapability, invoiceCapability],
  permissions: [invoicePermission],
  context: { organizationId },
});
assert.equal(needsInput.stage, "INPUT_CLARIFICATION_REQUIRED");
assert.equal(needsInput.ready_for_governed_binding, false);
assert.equal(needsInput.capability, undefined);
assert.equal(needsInput.plan.capability?.key, invoiceCapability.key);
assert.equal(needsInput.actor_policy_filtered_capability_count, 1);
assert.deepEqual(needsInput.plan.payload, {
  description: "Create a customer invoice for the refined direction",
});
assert.deepEqual(needsInput.input_state?.missing_required_fields, [
  "customer_id",
  "amount",
]);
assert.equal(needsInput.clarification.required, true);
assert.equal(needsInput.execution_authorized, false);

const invalidAnswer = continueRecommendationRefinementPreparation({
  proposal: needsInput.proposal,
  inputState: needsInput.input_state,
  capability: invoiceCapability,
  answers: { customer_id: "not-a-uuid", amount: "1500" },
  permissions: [invoicePermission],
  context: { organizationId },
});
assert.equal(invalidAnswer.stage, "INPUT_CLARIFICATION_REQUIRED");
assert.equal(invalidAnswer.ready_for_governed_binding, false);
assert.equal(invalidAnswer.answer_result.accepted, false);
assert.deepEqual(invalidAnswer.answer_result.rejected_fields, [
  { field: "customer_id", reason: "UUID_REQUIRED" },
  { field: "amount", reason: "NUMBER_REQUIRED" },
]);
assert.equal(invalidAnswer.execution_authorized, false);

const complete = continueRecommendationRefinementPreparation({
  proposal: needsInput.proposal,
  inputState: needsInput.input_state,
  capability: invoiceCapability,
  answers: { customer_id: customerId, amount: 1500 },
  permissions: [invoicePermission],
  context: { organizationId },
});
assert.equal(complete.stage, "READY_FOR_GOVERNED_BINDING");
assert.equal(complete.ready_for_governed_binding, true);
assert.deepEqual(complete.recommendation?.payload, {
  description: "Create a customer invoice for the refined direction",
  customer_id: customerId,
  amount: 1500,
});
assert.equal(complete.revalidation?.current_capability_revalidated, true);
assert.equal(complete.binding_preflight?.ready_for_governed_binding, true);
assert.equal(complete.binding_preflight?.actor_policy?.allowed, true);
assert.equal(complete.recommendation_binding_created, false);
assert.equal(complete.execution_authorized, false);

const revokedBeforeBinding = continueRecommendationRefinementPreparation({
  proposal: needsInput.proposal,
  inputState: needsInput.input_state,
  capability: invoiceCapability,
  answers: { customer_id: customerId, amount: 1500 },
  permissions: [],
  context: { organizationId },
});
assert.equal(revokedBeforeBinding.stage, "BINDING_PREFLIGHT_FAILED_CLOSED");
assert.equal(revokedBeforeBinding.ready_for_governed_binding, false);
assert.equal(
  revokedBeforeBinding.binding_preflight?.reason,
  "REFINEMENT_ACTOR_CAPABILITY_POLICY_CHANGED",
);
assert.equal(
  revokedBeforeBinding.binding_preflight?.actor_policy?.reason,
  "CURRENT_ACTOR_PERMISSION_DENIED",
);
assert.equal(revokedBeforeBinding.execution_authorized, false);
assert.equal(revokedBeforeBinding.recommendation_binding_created, false);

const ambiguous = prepareRecommendationRefinement({
  proposal: {
    proposal_id: "refinement_ambiguous",
    proposal_text: "review",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [
    { ...oldCapability, key: "platform.review_a.write", name: "Review A" },
    { ...oldCapability, key: "platform.review_b.write", name: "Review B" },
  ],
  permissions: [legacyPermission],
  context: {},
});
assert.equal(ambiguous.stage, "CAPABILITY_CLARIFICATION_REQUIRED");
assert.equal(ambiguous.plan.capability, null);
assert.equal(ambiguous.clarification.reason, "CAPABILITY_NOT_STRONGLY_RESOLVED");
assert.equal(ambiguous.ready_for_governed_binding, false);
assert.equal(ambiguous.execution_authorized, false);

const driftedInvoice = {
  ...invoiceCapability,
  input_schema: {
    ...invoiceCapability.input_schema,
    properties: {
      ...invoiceCapability.input_schema.properties,
      currency: { type: "string", enum: ["THB", "USD"] },
    },
    required: [...invoiceCapability.input_schema.required, "currency"],
  },
};
const drifted = continueRecommendationRefinementPreparation({
  proposal: needsInput.proposal,
  inputState: needsInput.input_state,
  capability: driftedInvoice,
  answers: { customer_id: customerId, amount: 1500 },
  permissions: [invoicePermission],
  context: { organizationId },
});
assert.equal(drifted.stage, "INPUT_CLARIFICATION_REQUIRED");
assert.equal(drifted.ready_for_governed_binding, false);
assert.equal(drifted.answer_result?.reason, "REFINEMENT_INPUT_SCHEMA_CHANGED");
assert.equal(drifted.candidate, undefined);
assert.equal(drifted.execution_authorized, false);
assert.equal(drifted.pending_execution_created, false);
assert.equal(drifted.autonomous_run_created, false);

const deniedAtSelection = prepareRecommendationRefinement({
  proposal: {
    proposal_id: "refinement_denied",
    proposal_text: "Create a customer invoice for the refined direction",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [invoiceCapability],
  permissions: [],
  context: { organizationId },
});
assert.equal(deniedAtSelection.stage, "CAPABILITY_CLARIFICATION_REQUIRED");
assert.equal(deniedAtSelection.actor_policy_filtered_capability_count, 0);
assert.equal(deniedAtSelection.plan.capability, null);
assert.equal(deniedAtSelection.ready_for_governed_binding, false);
assert.equal(deniedAtSelection.execution_authorized, false);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_RUNTIME_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_IMMEDIATE=PREBINDING_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_CLARIFICATION=EXACT_REQUIRED_FIELDS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_INVALID_INPUT=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_SCHEMA_DRIFT=FAIL_CLOSED_IMMEDIATELY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_PERMISSION_SELECTION=FILTERED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_PERMISSION_REVOCATION=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_BINDING=NOT_CREATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_EXECUTION=NONE");
