import assert from "node:assert/strict";
import {
  resolveRecommendationRefinementPayload,
} from "../lib/operator/runtime/OperatorRecommendationRefinementPayloadResolver.js";

const selected = {
  status: "SELECTED",
  proposal_text: "Reassess current main and improve the exact refinement boundary",
};

const productEngineering = resolveRecommendationRefinementPayload({
  proposal: selected,
  capability: {
    input_schema: {
      type: "object",
      properties: {
        focus: { type: "string", maxLength: 2000 },
      },
      required: ["focus"],
    },
  },
});
assert.equal(productEngineering.ready, true);
assert.deepEqual(productEngineering.payload, {
  focus: selected.proposal_text,
});
assert.deepEqual(productEngineering.derived_fields, ["focus"]);
assert.deepEqual(productEngineering.missing_required_fields, []);
assert.equal(productEngineering.old_payload_reused, false);

const contextual = resolveRecommendationRefinementPayload({
  proposal: selected,
  capability: {
    input_schema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        objective: { type: "string" },
      },
      required: ["organization_id", "objective"],
    },
  },
});
assert.equal(contextual.ready, true);
assert.deepEqual(contextual.payload, {
  objective: selected.proposal_text,
});
assert.deepEqual(contextual.context_fields, ["organization_id"]);

const unsafe = resolveRecommendationRefinementPayload({
  proposal: selected,
  capability: {
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", format: "uuid" },
        amount: { type: "number" },
        due_date: { type: "string", format: "date" },
        status: { type: "string", enum: ["DRAFT", "FINAL"] },
        approved: { type: "boolean" },
        message: { type: "string" },
      },
      required: [
        "customer_id",
        "amount",
        "due_date",
        "status",
        "approved",
        "message",
      ],
    },
  },
});
assert.equal(unsafe.ready, false);
assert.deepEqual(unsafe.payload, {
  message: selected.proposal_text,
});
assert.deepEqual(unsafe.derived_fields, ["message"]);
assert.deepEqual(unsafe.missing_required_fields, [
  "customer_id",
  "amount",
  "due_date",
  "status",
  "approved",
]);
assert.equal(unsafe.guessed_identifiers, false);
assert.equal(unsafe.guessed_numbers, false);
assert.equal(unsafe.guessed_dates, false);
assert.equal(unsafe.guessed_enums, false);
assert.equal(unsafe.guessed_booleans, false);
assert.equal(unsafe.old_payload_reused, false);

const enumFocus = resolveRecommendationRefinementPayload({
  proposal: selected,
  capability: {
    input_schema: {
      type: "object",
      properties: {
        focus: { type: "string", enum: ["A", "B"] },
      },
      required: ["focus"],
    },
  },
});
assert.equal(enumFocus.ready, false);
assert.deepEqual(enumFocus.payload, {});
assert.deepEqual(enumFocus.missing_required_fields, ["focus"]);

const formattedQuery = resolveRecommendationRefinementPayload({
  proposal: selected,
  capability: {
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", format: "uri" },
      },
      required: ["query"],
    },
  },
});
assert.equal(formattedQuery.ready, false);
assert.deepEqual(formattedQuery.payload, {});

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_RESOLUTION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_SAFE_TEXT=SCHEMA_DECLARED_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_CONTEXT=RUNTIME_CONTEXT_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_IDS=NOT_GUESSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_NUMBERS=NOT_GUESSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_DATES=NOT_GUESSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_ENUMS=NOT_GUESSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_BOOLEANS=NOT_GUESSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_OLD_PAYLOAD=NOT_REUSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PAYLOAD_MISSING_REQUIRED=FAIL_CLOSED");
