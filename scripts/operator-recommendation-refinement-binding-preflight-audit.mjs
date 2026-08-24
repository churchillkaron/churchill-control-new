import assert from "node:assert/strict";
import {
  preflightRecommendationRefinementBinding,
} from "../lib/operator/runtime/OperatorRecommendationRefinementBindingPreflight.js";

const organizationId = "63e6b0d7-9882-4db4-a2c3-e695487ba21d";
const customerId = "2f1c9f57-5917-4b26-84d1-086de4d86f79";
const invoicePermission = "finance.customer_invoice.manage";
const capability = {
  key: "finance.customer_invoice.write",
  mode: "write",
  name: "Create customer invoice",
  description: "Create a customer invoice",
  permissions: [invoicePermission],
  operator_enabled: true,
  requires_confirmation: true,
  input_schema: {
    type: "object",
    properties: {
      organization_id: { type: "string", format: "uuid" },
      customer_id: { type: "string", format: "uuid" },
      amount: { type: "number" },
      status: { type: "string", enum: ["DRAFT", "FINAL"] },
    },
    required: ["organization_id", "customer_id", "amount", "status"],
  },
};
const candidate = {
  candidate_kind: "refinement_revalidated_recommendation_candidate",
  capability_key: capability.key,
  description: "Create the refined invoice",
  payload: {
    organization_id: organizationId,
    customer_id: customerId,
    amount: 1500,
    status: "DRAFT",
  },
  reason: "Current capability and schema were revalidated",
  original_message: "Create the refined invoice",
  objective: "Create the refined invoice",
  authorization_effect: "NONE",
  execution_authorized: false,
  recommendation_binding_created: false,
  pending_execution_created: false,
  autonomous_run_created: false,
  old_payload_reused: false,
  requires_fresh_recommendation_binding: true,
};

const actor = { permissions: [invoicePermission], role: "ACCOUNTANT" };
const valid = preflightRecommendationRefinementBinding({
  candidate,
  capability,
  context: { organizationId },
  ...actor,
});
assert.equal(valid.ready_for_governed_binding, true);
assert.equal(valid.actor_policy.allowed, true);
assert.equal(valid.recommendation.capability_key, capability.key);
assert.deepEqual(valid.recommendation.payload, candidate.payload);
assert.equal(valid.authorization_effect, "NONE");
assert.equal(valid.execution_authorized, false);

const revoked = preflightRecommendationRefinementBinding({
  candidate,
  capability,
  context: { organizationId },
  permissions: [],
  role: "ACCOUNTANT",
});
assert.equal(revoked.ready_for_governed_binding, false);
assert.equal(revoked.reason, "REFINEMENT_ACTOR_CAPABILITY_POLICY_CHANGED");
assert.equal(revoked.actor_policy.reason, "CURRENT_ACTOR_PERMISSION_DENIED");
assert.equal(revoked.recommendation, null);

for (const [field, unsafeValue] of [
  ["authorization_effect", "EXECUTE"],
  ["execution_authorized", true],
  ["recommendation_binding_created", true],
  ["pending_execution_created", true],
  ["autonomous_run_created", true],
  ["old_payload_reused", true],
  ["requires_fresh_recommendation_binding", false],
]) {
  const unsafe = preflightRecommendationRefinementBinding({
    candidate: { ...candidate, [field]: unsafeValue },
    capability,
    context: { organizationId },
    ...actor,
  });
  assert.equal(unsafe.ready_for_governed_binding, false);
  assert.equal(unsafe.reason, "REFINEMENT_CANDIDATE_NOT_SAFE_FOR_BINDING");
}

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_ACTOR_RECHECK=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_BINDING=NOT_CREATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_EXECUTION=NONE");
