import assert from "node:assert/strict";
import { prepareSelectedRefinementForGovernedBinding } from "../lib/operator/runtime/OperatorRecommendationRefinementPreparationBridge.js";

const capability = {
  key: "finance.customer_invoice.write",
  mode: "write",
  name: "Create invoice",
  operator_enabled: true,
  permissions: ["finance.customer_invoice.manage"],
  requires_confirmation: true,
  input_schema: {
    type: "object",
    properties: {
      customer_id: { type: "string", format: "uuid" },
      amount: { type: "number" },
    },
    required: ["customer_id", "amount"],
  },
};

const ready = prepareSelectedRefinementForGovernedBinding({
  proposal: {
    proposal_text: "Create customer invoice",
    proposal_id: "bridge-ready",
  },
  capabilities: [capability],
  permissions: ["finance.customer_invoice.manage"],
});

assert.equal(ready.execution_authorized, false);
assert.equal(ready.pending_execution_created, false);
assert.equal(ready.autonomous_run_created, false);
assert.equal(ready.old_payload_reused, false);
assert.equal(ready.stage, "INPUT_CLARIFICATION_REQUIRED");

const denied = prepareSelectedRefinementForGovernedBinding({
  proposal: {
    proposal_text: "Create customer invoice",
    proposal_id: "bridge-denied",
  },
  capabilities: [capability],
  permissions: [],
});

assert.equal(denied.execution_authorized, false);
assert.equal(denied.pending_execution_created, false);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_BRIDGE_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_BRIDGE_AUTHORITY=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PREPARATION_BRIDGE_BINDING=NOT_CREATED");
