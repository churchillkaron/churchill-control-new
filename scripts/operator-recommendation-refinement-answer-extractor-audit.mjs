import assert from "node:assert/strict";
import {
  extractRecommendationRefinementInputAnswers,
} from "../lib/operator/runtime/OperatorRecommendationRefinementAnswerExtractor.js";

const capability = {
  key: "finance.customer_invoice.write",
  input_schema: {
    type: "object",
    properties: {
      customer_id: { type: "string", format: "uuid", title: "Customer" },
      amount: { type: "number", title: "Amount" },
      status: { type: "string", enum: ["DRAFT", "FINAL"], title: "Invoice status" },
      approved: { type: "boolean", title: "Approved" },
      note: { type: "string", title: "Note" },
    },
  },
};
const clarification = {
  fields: [
    { field: "customer_id", label: "Customer" },
    { field: "amount", label: "Amount" },
    { field: "status", label: "Invoice status" },
    { field: "approved", label: "Approved" },
    { field: "note", label: "Note" },
  ],
};
const customerId = "2f1c9f57-5917-4b26-84d1-086de4d86f79";

const explicit = extractRecommendationRefinementInputAnswers({
  message: `Customer: ${customerId}; Amount = 1500.5; Invoice status: draft; Approved: false; Note: "Exact user note"`,
  clarification,
  capability,
});
assert.equal(explicit.accepted, true);
assert.deepEqual(explicit.rejected_segments, []);
assert.deepEqual(explicit.answers, {
  customer_id: customerId,
  amount: 1500.5,
  status: "DRAFT",
  approved: false,
  note: "Exact user note",
});
assert.equal(explicit.inference_used, false);
assert.equal(explicit.unrequested_fields_accepted, false);
assert.equal(explicit.authorization_effect, "NONE");
assert.equal(explicit.execution_authorized, false);
assert.equal(explicit.pending_execution_created, false);
assert.equal(explicit.autonomous_run_created, false);

const freeText = extractRecommendationRefinementInputAnswers({
  message: `Use ${customerId} and make it around 1500 please`,
  clarification,
  capability,
});
assert.equal(freeText.accepted, false);
assert.deepEqual(freeText.answers, {});
assert.equal(freeText.rejected_segments[0]?.reason, "EXPLICIT_FIELD_ASSIGNMENT_REQUIRED");
assert.equal(freeText.inference_used, false);

const unrequested = extractRecommendationRefinementInputAnswers({
  message: "currency: THB",
  clarification,
  capability,
});
assert.equal(unrequested.accepted, false);
assert.deepEqual(unrequested.answers, {});
assert.equal(unrequested.rejected_segments[0]?.reason, "FIELD_NOT_REQUESTED");

const unsafeTypes = extractRecommendationRefinementInputAnswers({
  message: "Amount: fifteen hundred; Approved: yes; Invoice status: PAID",
  clarification,
  capability,
});
assert.equal(unsafeTypes.accepted, false);
assert.deepEqual(unsafeTypes.answers, {});
assert.deepEqual(
  unsafeTypes.rejected_segments.map((item) => item.reason),
  [
    "EXPLICIT_NUMBER_REQUIRED",
    "EXPLICIT_BOOLEAN_REQUIRED",
    "ENUM_VALUE_NOT_EXPLICITLY_MATCHED",
  ],
);

const duplicate = extractRecommendationRefinementInputAnswers({
  message: "Amount: 1000; amount: 1200",
  clarification,
  capability,
});
assert.equal(duplicate.accepted, false);
assert.deepEqual(duplicate.answers, { amount: 1000 });
assert.equal(duplicate.rejected_segments[0]?.reason, "DUPLICATE_FIELD_ASSIGNMENT");

const quotedString = extractRecommendationRefinementInputAnswers({
  message: "Note = 'keep this exact wording'",
  clarification,
  capability,
});
assert.equal(quotedString.accepted, true);
assert.equal(quotedString.answers.note, "keep this exact wording");

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ANSWER_EXTRACTOR_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ANSWER_EXTRACTOR_ASSIGNMENTS=EXPLICIT_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ANSWER_EXTRACTOR_LABELS=REGISTERED_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ANSWER_EXTRACTOR_ENUMS=EXACT_REGISTERED_MATCH_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ANSWER_EXTRACTOR_TYPES=SYNTAX_ONLY_NO_GUESSING");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ANSWER_EXTRACTOR_FREE_TEXT=NOT_INFERRED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ANSWER_EXTRACTOR_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ANSWER_EXTRACTOR_EXECUTION=NONE");
