import assert from "node:assert/strict";
import {
  preflightRecommendationRefinementBinding,
} from "../lib/operator/runtime/OperatorRecommendationRefinementBindingPreflight.js";

const organizationId = "63e6b0d7-9882-4db4-a2c3-e695487ba21d";
const customerId = "2f1c9f57-5917-4b26-84d1-086de4d86f79";
const capability = {
  key: "finance.customer_invoice.write",
  name: "Create customer invoice",
  description: "Create a customer invoice",
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

const valid = preflightRecommendationRefinementBinding({
  candidate,
  capability,
  context: { organizationId },
});
assert.equal(valid.ready_for_governed_binding, true);
assert.equal(valid.reason, null);
assert.ok(valid.recommendation);
assert.equal(valid.recommendation.capability_key, capability.key);
assert.deepEqual(valid.recommendation.payload, candidate.payload);
assert.equal(valid.recommendation.source, "selected_refinement_binding_preflight");
assert.equal(valid.authorization_effect, "NONE");
assert.equal(valid.execution_authorized, false);
assert.equal(valid.recommendation_binding_created, false);
assert.equal(valid.pending_execution_created, false);
assert.equal(valid.autonomous_run_created, false);
assert.equal(valid.old_payload_reused, false);
for (const forbidden of ["recommendation_id", "pending_execution", "autonomous_run", "run_id"]) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(valid.recommendation, forbidden),
    false,
    `preflight recommendation must not contain ${forbidden}`,
  );
}

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
  });
  assert.equal(unsafe.ready_for_governed_binding, false);
  assert.equal(unsafe.reason, "REFINEMENT_CANDIDATE_NOT_SAFE_FOR_BINDING");
  assert.equal(unsafe.recommendation, null);
}

const changedCapability = preflightRecommendationRefinementBinding({
  candidate,
  capability: { ...capability, key: "finance.vendor_bill.write" },
  context: { organizationId },
});
assert.equal(changedCapability.ready_for_governed_binding, false);
assert.equal(changedCapability.reason, "REFINEMENT_CANDIDATE_NOT_SAFE_FOR_BINDING");

const missingContext = preflightRecommendationRefinementBinding({
  candidate,
  capability,
  context: {},
});
assert.equal(missingContext.ready_for_governed_binding, false);
assert.equal(missingContext.reason, "REFINEMENT_CANDIDATE_STALE_BEFORE_BINDING");
assert.deepEqual(missingContext.revalidation?.missing_required_fields, ["organization_id"]);

const enumDrift = preflightRecommendationRefinementBinding({
  candidate,
  capability: {
    ...capability,
    input_schema: {
      ...capability.input_schema,
      properties: {
        ...capability.input_schema.properties,
        status: { type: "string", enum: ["FINAL"] },
      },
    },
  },
  context: { organizationId },
});
assert.equal(enumDrift.ready_for_governed_binding, false);
assert.equal(enumDrift.reason, "REFINEMENT_CANDIDATE_STALE_BEFORE_BINDING");
assert.deepEqual(enumDrift.revalidation?.invalid_fields, [
  { field: "status", reason: "ENUM_VALUE_NOT_ALLOWED" },
]);

const newRequired = preflightRecommendationRefinementBinding({
  candidate,
  capability: {
    ...capability,
    input_schema: {
      ...capability.input_schema,
      properties: {
        ...capability.input_schema.properties,
        currency: { type: "string", enum: ["THB", "USD"] },
      },
      required: [...capability.input_schema.required, "currency"],
    },
  },
  context: { organizationId },
});
assert.equal(newRequired.ready_for_governed_binding, false);
assert.equal(newRequired.reason, "REFINEMENT_CANDIDATE_STALE_BEFORE_BINDING");
assert.deepEqual(newRequired.revalidation?.missing_required_fields, ["currency"]);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_CURRENT_SCHEMA=RECHECKED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_CURRENT_CONTEXT=RECHECKED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_STALE_CANDIDATE=REJECTED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_BINDING=NOT_CREATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_BINDING_PREFLIGHT_EXECUTION=NONE");
