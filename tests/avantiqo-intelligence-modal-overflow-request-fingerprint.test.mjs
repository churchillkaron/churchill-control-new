import assert from "node:assert/strict";
import test from "node:test";
import {
  intelligenceModalOverflowRequestFingerprint,
} from "../lib/platform/service-runtime/governance/IntelligenceModalOverflowFingerprintPolicy.js";

const identity = {
  contract: "AVANTIQO_OPERATOR_MODAL_OVERFLOW_REQUEST_IDENTITY_V1",
  organization_id: "org-1",
  entity_id: "entity-1",
  party_id: "party-1",
  service_id: "ai.reasoning.execute",
  execution_lane: "deep",
  source: "text",
  original_user_message: "Analyze the complete project deeply",
};

function request(extra = {}) {
  return {
    capability: "ai.reasoning.execute",
    execution_lane: "deep",
    model: "owned-deep-model",
    max_output_tokens: 1400,
    response_format: { type: "json_object" },
    modal_overflow_request_identity: identity,
    input: JSON.stringify({ recent_conversation: extra.conversation || [], agreement_state: extra.agreement || {} }),
    ...extra,
  };
}

test("stable explicit identity survives conversation and approval-state changes", () => {
  const first = intelligenceModalOverflowRequestFingerprint(request({
    conversation: [{ role: "user", content: "Analyze the complete project deeply" }],
  }), "deep");
  const afterApproval = intelligenceModalOverflowRequestFingerprint(request({
    conversation: [
      { role: "user", content: "Analyze the complete project deeply" },
      { role: "assistant", content: "Approve Modal Deep?" },
      { role: "user", content: "approve" },
    ],
    agreement: { intelligence_modal_overflow_proposal: { status: "APPROVED" } },
    modal_overflow_proposal_id: "proposal-1",
  }), "deep");
  assert.equal(first, afterApproval);
});

test("changing the original request changes the approval fingerprint", () => {
  const first = intelligenceModalOverflowRequestFingerprint(request(), "deep");
  const changed = intelligenceModalOverflowRequestFingerprint({
    ...request(),
    modal_overflow_request_identity: { ...identity, original_user_message: "Analyze a different project" },
  }, "deep");
  assert.notEqual(first, changed);
});

test("changing lane or output contract changes the approval fingerprint", () => {
  const first = intelligenceModalOverflowRequestFingerprint(request(), "deep");
  assert.notEqual(first, intelligenceModalOverflowRequestFingerprint({ ...request(), execution_lane: "fast" }, "fast"));
  assert.notEqual(first, intelligenceModalOverflowRequestFingerprint({ ...request(), max_output_tokens: 1600 }, "deep"));
});
