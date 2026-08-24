import assert from "node:assert/strict";
import {
  applyRecommendationRefinementInputAnswers,
  createRecommendationRefinementInputState,
} from "../lib/operator/runtime/OperatorRecommendationRefinementInputState.js";

const capability = {
  key: "finance.customer_invoice.write",
  input_schema: {
    type: "object",
    properties: {
      customer_id: { type: "string", format: "uuid" },
      amount: { type: "number" },
      due_date: { type: "string", format: "date" },
      status: { type: "string", enum: ["DRAFT", "FINAL"] },
      approved: { type: "boolean" },
      description: { type: "string" },
    },
    required: [
      "customer_id",
      "amount",
      "due_date",
      "status",
      "approved",
      "description",
    ],
  },
};

const proposal = {
  proposal_id: "operator_refinement_input_state_audit",
  proposal_text: "Create the refined customer invoice",
};
const state = createRecommendationRefinementInputState({
  proposal,
  plan: {
    capability,
    payload: { description: proposal.proposal_text },
    missing_required_fields: [
      "customer_id",
      "amount",
      "due_date",
      "status",
      "approved",
    ],
  },
});
assert.ok(state);
assert.equal(state.status, "AWAITING_REQUIRED_INPUTS");
assert.equal(state.proposal_id, proposal.proposal_id);
assert.equal(state.proposal_text, proposal.proposal_text);
assert.equal(typeof state.capability_input_contract, "string");
assert.ok(state.capability_input_contract.length > 20);
assert.deepEqual(state.partial_payload, {
  description: proposal.proposal_text,
});
assert.deepEqual(state.missing_required_fields, [
  "customer_id",
  "amount",
  "due_date",
  "status",
  "approved",
]);
assert.equal(state.authorization_effect, "NONE");
assert.equal(state.execution_authorized, false);
assert.equal(state.pending_execution_created, false);
assert.equal(state.autonomous_run_created, false);
assert.equal(state.old_payload_reused, false);
assert.equal(state.requires_capability_revalidation, true);

const validCustomerId = "2f1c9f57-5917-4b26-84d1-086de4d86f79";
const partial = applyRecommendationRefinementInputAnswers({
  state,
  proposal,
  capability,
  answers: {
    customer_id: validCustomerId,
    amount: 1500,
  },
});
assert.equal(partial.accepted, true);
assert.equal(partial.complete, false);
assert.deepEqual(partial.rejected_fields, []);
assert.equal(partial.state.status, "AWAITING_REQUIRED_INPUTS");
assert.equal(partial.state.partial_payload.customer_id, validCustomerId);
assert.equal(partial.state.partial_payload.amount, 1500);
assert.deepEqual(partial.state.missing_required_fields, [
  "due_date",
  "status",
  "approved",
]);
assert.equal(partial.state.execution_authorized, false);
assert.equal(partial.state.pending_execution_created, false);
assert.equal(partial.state.autonomous_run_created, false);

const invalid = applyRecommendationRefinementInputAnswers({
  state,
  proposal,
  capability,
  answers: {
    customer_id: "not-a-uuid",
    amount: "1500",
    due_date: "2026-02-30",
    status: "PAID",
    approved: "true",
    currency: "THB",
  },
});
assert.equal(invalid.accepted, false);
assert.equal(invalid.complete, false);
assert.equal(invalid.reason, "INVALID_OR_UNREQUESTED_INPUTS");
assert.deepEqual(invalid.rejected_fields, [
  { field: "customer_id", reason: "UUID_REQUIRED" },
  { field: "amount", reason: "NUMBER_REQUIRED" },
  { field: "due_date", reason: "ISO_DATE_REQUIRED" },
  { field: "status", reason: "ENUM_VALUE_NOT_ALLOWED" },
  { field: "approved", reason: "BOOLEAN_REQUIRED" },
  { field: "currency", reason: "FIELD_NOT_REQUESTED" },
]);
assert.deepEqual(invalid.state.partial_payload, {
  description: proposal.proposal_text,
});
assert.equal(invalid.state.execution_authorized, false);

const completed = applyRecommendationRefinementInputAnswers({
  state: partial.state,
  proposal,
  capability,
  answers: {
    due_date: "2026-08-24",
    status: "DRAFT",
    approved: false,
  },
});
assert.equal(completed.accepted, true);
assert.equal(completed.complete, true);
assert.deepEqual(completed.rejected_fields, []);
assert.equal(completed.state.status, "READY_FOR_CAPABILITY_REVALIDATION");
assert.deepEqual(completed.state.missing_required_fields, []);
assert.deepEqual(completed.state.partial_payload, {
  description: proposal.proposal_text,
  customer_id: validCustomerId,
  amount: 1500,
  due_date: "2026-08-24",
  status: "DRAFT",
  approved: false,
});
assert.equal(completed.state.requires_capability_revalidation, true);
assert.equal(completed.state.authorization_effect, "NONE");
assert.equal(completed.state.execution_authorized, false);
assert.equal(completed.state.pending_execution_created, false);
assert.equal(completed.state.autonomous_run_created, false);
assert.equal(completed.state.old_payload_reused, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(completed.state, "recommendation_id"),
  false,
  "completed clarification inputs must not create recommendation authority",
);

const mismatch = applyRecommendationRefinementInputAnswers({
  state,
  proposal,
  capability: { ...capability, key: "finance.vendor_bill.write" },
  answers: { customer_id: validCustomerId },
});
assert.equal(mismatch.accepted, false);
assert.equal(mismatch.reason, "REFINEMENT_INPUT_STATE_MISMATCH");
assert.deepEqual(mismatch.rejected_fields, []);
assert.deepEqual(mismatch.state, state);

const staleProposal = applyRecommendationRefinementInputAnswers({
  state,
  proposal: {
    proposal_id: "different_refinement",
    proposal_text: "Different direction",
  },
  capability,
  answers: { customer_id: validCustomerId },
});
assert.equal(staleProposal.accepted, false);
assert.equal(staleProposal.reason, "REFINEMENT_INPUT_STATE_MISMATCH");
assert.deepEqual(staleProposal.state, state);

const schemaDrift = applyRecommendationRefinementInputAnswers({
  state,
  proposal,
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
  answers: { customer_id: validCustomerId },
});
assert.equal(schemaDrift.accepted, false);
assert.equal(schemaDrift.reason, "REFINEMENT_INPUT_SCHEMA_CHANGED");
assert.deepEqual(schemaDrift.state, state);
assert.equal(schemaDrift.state.execution_authorized, false);

const enumSchemaDrift = applyRecommendationRefinementInputAnswers({
  state,
  proposal,
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
  answers: { customer_id: validCustomerId },
});
assert.equal(enumSchemaDrift.accepted, false);
assert.equal(enumSchemaDrift.reason, "REFINEMENT_INPUT_SCHEMA_CHANGED");

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_PROPOSAL=EXACT_BOUND");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_SCHEMA=EXACT_BOUND");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_FIELDS=REQUESTED_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_TYPES=NO_COERCION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_ENUMS=EXACT_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_EXTRA_FIELDS=REJECTED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_COMPLETE=REVALIDATION_REQUIRED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_INPUT_STATE_EXECUTION=NONE");
