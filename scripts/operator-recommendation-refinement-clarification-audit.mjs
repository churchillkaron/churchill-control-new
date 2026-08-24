import assert from "node:assert/strict";
import {
  buildRecommendationRefinementClarification,
} from "../lib/operator/runtime/OperatorRecommendationRefinementClarification.js";

const unresolved = buildRecommendationRefinementClarification({
  plan: {
    capability: null,
    missing_required_fields: [],
  },
});
assert.equal(unresolved.required, true);
assert.equal(unresolved.reason, "CAPABILITY_NOT_STRONGLY_RESOLVED");
assert.equal(unresolved.capability_key, null);
assert.deepEqual(unresolved.fields, []);
assert.equal(unresolved.authorization_effect, "NONE");
assert.equal(unresolved.execution_authorized, false);

const capability = {
  key: "finance.customer_invoice.write",
  name: "Create customer invoice",
  input_schema: {
    type: "object",
    properties: {
      customer_id: {
        type: "string",
        format: "uuid",
        title: "Customer",
        description: "Exact customer identifier",
      },
      amount: {
        type: "number",
        title: "Amount",
      },
      status: {
        type: "string",
        title: "Invoice status",
        enum: ["DRAFT", "FINAL"],
      },
    },
    required: ["customer_id", "amount", "status"],
  },
};
const missing = buildRecommendationRefinementClarification({
  plan: {
    capability,
    missing_required_fields: ["customer_id", "amount", "status"],
  },
});
assert.equal(missing.required, true);
assert.equal(missing.reason, "REQUIRED_INPUTS_MISSING");
assert.equal(missing.capability_key, capability.key);
assert.deepEqual(
  missing.fields.map((field) => field.field),
  ["customer_id", "amount", "status"],
);
assert.equal(missing.fields[0].format, "uuid");
assert.deepEqual(missing.fields[2].enum_values, ["DRAFT", "FINAL"]);
assert.ok(missing.question.includes("Customer"));
assert.ok(missing.question.includes("Amount"));
assert.ok(missing.question.includes("Invoice status"));
assert.ok(missing.question.includes("I will not guess missing values"));
assert.equal(missing.authorization_effect, "NONE");
assert.equal(missing.execution_authorized, false);
assert.equal(missing.pending_execution_created, false);
assert.equal(missing.autonomous_run_created, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(missing, "selected_enum_value"),
  false,
  "clarification may expose registered enum choices but must not select one",
);

const ready = buildRecommendationRefinementClarification({
  plan: {
    capability,
    missing_required_fields: [],
  },
});
assert.equal(ready.required, false);
assert.equal(ready.reason, null);
assert.equal(ready.question, null);
assert.deepEqual(ready.fields, []);
assert.equal(ready.execution_authorized, false);
assert.equal(ready.pending_execution_created, false);
assert.equal(ready.autonomous_run_created, false);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CLARIFICATION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CLARIFICATION_CAPABILITY=EXACT_OR_ASK");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CLARIFICATION_FIELDS=MISSING_SCHEMA_FIELDS_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CLARIFICATION_ENUMS=OFFERED_NOT_SELECTED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CLARIFICATION_GUESSES=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CLARIFICATION_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CLARIFICATION_EXECUTION=NONE");
