import assert from "node:assert/strict";
import {
  revalidateRecommendationRefinementInputs,
} from "../lib/operator/runtime/OperatorRecommendationRefinementRevalidation.js";

const capability = {
  key: "finance.customer_invoice.write",
  input_schema: {
    type: "object",
    properties: {
      organization_id: { type: "string", format: "uuid" },
      customer_id: { type: "string", format: "uuid" },
      amount: { type: "number" },
      due_date: { type: "string", format: "date" },
      status: { type: "string", enum: ["DRAFT", "FINAL"] },
      approved: { type: "boolean" },
      description: { type: "string" },
    },
    required: [
      "organization_id",
      "customer_id",
      "amount",
      "due_date",
      "status",
      "approved",
      "description",
    ],
  },
};
const organizationId = "63e6b0d7-9882-4db4-a2c3-e695487ba21d";
const customerId = "2f1c9f57-5917-4b26-84d1-086de4d86f79";
const readyState = {
  status: "READY_FOR_CAPABILITY_REVALIDATION",
  capability_key: capability.key,
  partial_payload: {
    customer_id: customerId,
    amount: 1500,
    due_date: "2026-08-24",
    status: "DRAFT",
    approved: false,
    description: "Create the refined customer invoice",
  },
  missing_required_fields: [],
  authorization_effect: "NONE",
  execution_authorized: false,
  pending_execution_created: false,
  autonomous_run_created: false,
  old_payload_reused: false,
  requires_capability_revalidation: true,
};

const valid = revalidateRecommendationRefinementInputs({
  state: readyState,
  capability,
  context: { organizationId },
});
assert.equal(valid.reason, null);
assert.equal(valid.schema_drift_detected, false);
assert.equal(valid.current_capability_revalidated, true);
assert.equal(valid.ready_for_governed_recommendation, true);
assert.equal(valid.requires_fresh_recommendation_binding, true);
assert.deepEqual(valid.context_fields_satisfied, ["organization_id"]);
assert.deepEqual(valid.missing_required_fields, []);
assert.deepEqual(valid.invalid_fields, []);
assert.deepEqual(valid.payload, readyState.partial_payload);
assert.equal(valid.authorization_effect, "NONE");
assert.equal(valid.execution_authorized, false);
assert.equal(valid.pending_execution_created, false);
assert.equal(valid.autonomous_run_created, false);
assert.equal(valid.old_payload_reused, false);

const notReady = revalidateRecommendationRefinementInputs({
  state: { ...readyState, status: "AWAITING_REQUIRED_INPUTS" },
  capability,
  context: { organizationId },
});
assert.equal(notReady.ready_for_governed_recommendation, false);
assert.equal(notReady.reason, "INPUT_STATE_NOT_READY_FOR_REVALIDATION");
assert.equal(notReady.execution_authorized, false);

const missingCapability = revalidateRecommendationRefinementInputs({
  state: readyState,
  capability: null,
  context: { organizationId },
});
assert.equal(missingCapability.ready_for_governed_recommendation, false);
assert.equal(missingCapability.reason, "CURRENT_CAPABILITY_MISSING_OR_CHANGED");
assert.equal(missingCapability.schema_drift_detected, true);

const changedCapability = revalidateRecommendationRefinementInputs({
  state: readyState,
  capability: { ...capability, key: "finance.vendor_bill.write" },
  context: { organizationId },
});
assert.equal(changedCapability.ready_for_governed_recommendation, false);
assert.equal(changedCapability.reason, "CURRENT_CAPABILITY_MISSING_OR_CHANGED");

const missingContext = revalidateRecommendationRefinementInputs({
  state: readyState,
  capability,
  context: {},
});
assert.equal(missingContext.ready_for_governed_recommendation, false);
assert.deepEqual(missingContext.missing_required_fields, ["organization_id"]);
assert.equal(missingContext.schema_drift_detected, true);

const addedRequiredField = revalidateRecommendationRefinementInputs({
  state: readyState,
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
assert.equal(addedRequiredField.ready_for_governed_recommendation, false);
assert.deepEqual(addedRequiredField.missing_required_fields, ["currency"]);
assert.equal(addedRequiredField.schema_drift_detected, true);

const enumDrift = revalidateRecommendationRefinementInputs({
  state: readyState,
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
assert.equal(enumDrift.ready_for_governed_recommendation, false);
assert.deepEqual(enumDrift.invalid_fields, [
  { field: "status", reason: "ENUM_VALUE_NOT_ALLOWED" },
]);

const typeDrift = revalidateRecommendationRefinementInputs({
  state: readyState,
  capability: {
    ...capability,
    input_schema: {
      ...capability.input_schema,
      properties: {
        ...capability.input_schema.properties,
        amount: { type: "integer" },
      },
    },
  },
  context: { organizationId },
});
assert.equal(typeDrift.ready_for_governed_recommendation, true);
assert.equal(typeDrift.schema_drift_detected, false);

const incompatibleTypeDrift = revalidateRecommendationRefinementInputs({
  state: { ...readyState, partial_payload: { ...readyState.partial_payload, amount: 1500.5 } },
  capability: {
    ...capability,
    input_schema: {
      ...capability.input_schema,
      properties: {
        ...capability.input_schema.properties,
        amount: { type: "integer" },
      },
    },
  },
  context: { organizationId },
});
assert.equal(incompatibleTypeDrift.ready_for_governed_recommendation, false);
assert.deepEqual(incompatibleTypeDrift.invalid_fields, [
  { field: "amount", reason: "INTEGER_REQUIRED" },
]);

const removedField = revalidateRecommendationRefinementInputs({
  state: readyState,
  capability: {
    ...capability,
    input_schema: {
      type: "object",
      properties: {
        organization_id: capability.input_schema.properties.organization_id,
        customer_id: capability.input_schema.properties.customer_id,
        amount: capability.input_schema.properties.amount,
        due_date: capability.input_schema.properties.due_date,
        status: capability.input_schema.properties.status,
        approved: capability.input_schema.properties.approved,
      },
      required: [
        "organization_id",
        "customer_id",
        "amount",
        "due_date",
        "status",
        "approved",
      ],
    },
  },
  context: { organizationId },
});
assert.equal(removedField.ready_for_governed_recommendation, false);
assert.ok(
  removedField.invalid_fields.some(
    (item) => item.field === "description" && item.reason === "FIELD_NO_LONGER_IN_SCHEMA",
  ),
);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_CAPABILITY=CURRENT_EXACT_IDENTITY_REQUIRED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_CONTEXT=CURRENT_CONTEXT_REQUIRED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_SCHEMA_DRIFT=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_TYPES=RECHECKED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_ENUMS=RECHECKED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_READY=FRESH_BINDING_STILL_REQUIRED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_REVALIDATION_EXECUTION=NONE");
