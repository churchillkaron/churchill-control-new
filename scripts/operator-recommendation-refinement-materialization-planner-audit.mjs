import assert from "node:assert/strict";
import {
  planRecommendationRefinementMaterialization,
} from "../lib/operator/runtime/OperatorRecommendationRefinementMaterializationPlanner.js";

const oldCapability = {
  key: "platform.legacy.write",
  mode: "write",
  name: "Legacy action",
  description: "Use legacy action",
  operator_aliases: ["legacy action"],
  input_schema: { type: "object", properties: {}, required: [] },
};
const freshCapability = {
  key: "platform.product_engineering_cycle.execute",
  mode: "write",
  name: "Product engineering cycle",
  description: "Run product engineering cycle",
  operator_aliases: ["product engineering cycle", "engineering objective"],
  input_schema: {
    type: "object",
    properties: { focus: { type: "string" } },
    required: ["focus"],
  },
};

const ready = planRecommendationRefinementMaterialization({
  proposal: {
    status: "SELECTED",
    proposal_text: "Run the product engineering cycle for this engineering objective",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [oldCapability, freshCapability],
});
assert.equal(ready.ready, true);
assert.equal(ready.capability?.key, freshCapability.key);
assert.equal(ready.capability_resolution.kind, "FRESH_STRONG_CATALOG_RANKING");
assert.equal(ready.capability_resolution.old_capability_identity_reused, false);
assert.deepEqual(ready.payload, {
  focus: "Run the product engineering cycle for this engineering objective",
});
assert.equal(ready.authorization_effect, "NONE");
assert.equal(ready.execution_authorized, false);
assert.equal(ready.pending_execution_created, false);
assert.equal(ready.autonomous_run_created, false);
assert.equal(ready.old_payload_reused, false);
assert.equal(ready.requires_clarification, false);

const requiredIdCapability = {
  key: "finance.customer_invoice.write",
  mode: "write",
  name: "Customer invoice",
  description: "Create customer invoice",
  operator_aliases: ["customer invoice"],
  input_schema: {
    type: "object",
    properties: {
      customer_id: { type: "string", format: "uuid" },
      description: { type: "string" },
      amount: { type: "number" },
    },
    required: ["customer_id", "description", "amount"],
  },
};
const missing = planRecommendationRefinementMaterialization({
  proposal: {
    status: "SELECTED",
    proposal_text: "Create a customer invoice for the refined direction",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [oldCapability, requiredIdCapability],
});
assert.equal(missing.capability?.key, requiredIdCapability.key);
assert.equal(missing.ready, false);
assert.equal(missing.requires_clarification, true);
assert.deepEqual(missing.payload, {
  description: "Create a customer invoice for the refined direction",
});
assert.deepEqual(missing.missing_required_fields, ["customer_id", "amount"]);
assert.equal(missing.payload_resolution.guessed_identifiers, false);
assert.equal(missing.payload_resolution.guessed_numbers, false);
assert.equal(missing.old_payload_reused, false);

const ambiguous = planRecommendationRefinementMaterialization({
  proposal: {
    status: "SELECTED",
    proposal_text: "review",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [
    { ...oldCapability, key: "platform.review_a.write", name: "Review A" },
    { ...oldCapability, key: "platform.review_b.write", name: "Review B" },
  ],
});
assert.equal(ambiguous.ready, false);
assert.equal(ambiguous.capability, null);
assert.equal(ambiguous.requires_clarification, false);
assert.equal(ambiguous.capability_resolution.strong_match, false);
assert.equal(ambiguous.old_payload_reused, false);

const restored = planRecommendationRefinementMaterialization({
  proposal: {
    status: "SELECTED",
    proposal_text: "Use legacy action",
    previous_capability_key: oldCapability.key,
    selection_origin: "ORIGINAL_RECOMMENDATION_CONTEXT",
  },
  capabilities: [oldCapability, freshCapability],
});
assert.equal(restored.ready, true);
assert.equal(restored.capability?.key, oldCapability.key);
assert.equal(restored.capability_resolution.kind, "RESTORED_ORIGINAL_FRESH_IDENTITY");
assert.equal(restored.capability_resolution.old_capability_identity_reused, true);
assert.deepEqual(restored.payload, {});
assert.equal(restored.old_payload_reused, false);
assert.equal(restored.execution_authorized, false);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PLANNER_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PLANNER_CAPABILITY=FRESH_OR_EXPLICIT_RESTORE_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PLANNER_PAYLOAD=SCHEMA_SAFE_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PLANNER_MISSING_FIELDS=CLARIFICATION_REQUIRED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PLANNER_AMBIGUOUS=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PLANNER_OLD_PAYLOAD=NOT_REUSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PLANNER_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PLANNER_EXECUTION=NONE");
