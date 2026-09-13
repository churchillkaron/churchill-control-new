import assert from "node:assert/strict";
import test from "node:test";
import { fastConversationalLowConfidenceRequiresDeep } from "../lib/operator/runtime/OperatorFastFallbackPolicy.js";

const answer = (confidence) => ({
  response_text: "I would slow the reveal and let the tension build before the logo lands.",
  intent: "answer",
  confidence,
  navigation: { target_id: null },
  execution: { capability_key: null, payload: {}, reason: null },
});

test("ordinary creative discussion does not fall from Fast into Deep only for moderate confidence", () => {
  assert.equal(fastConversationalLowConfidenceRequiresDeep({
    parsed: answer(0.42), intent: "answer", currentStateEvidenceRequired: false,
  }), false);
});

test("very low confidence still escalates instead of bluffing", () => {
  assert.equal(fastConversationalLowConfidenceRequiresDeep({
    parsed: answer(0.2), intent: "answer", currentStateEvidenceRequired: false,
  }), true);
});

test("live business state remains evidence-gated regardless of conversational confidence", () => {
  assert.equal(fastConversationalLowConfidenceRequiresDeep({
    parsed: answer(0.42), intent: "answer", currentStateEvidenceRequired: true,
  }), true);
});

test("an action-bearing response never uses the conversational confidence exception", () => {
  const parsed = { ...answer(0.42), intent: "execute", execution: { capability_key: "finance.invoice.create", payload: {} } };
  assert.equal(fastConversationalLowConfidenceRequiresDeep({
    parsed, intent: "execute", currentStateEvidenceRequired: false,
  }), true);
});
