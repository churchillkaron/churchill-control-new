import test from "node:test";
import assert from "node:assert/strict";
import {
  assessCodeAIFinalIndependentReviewGate,
  codeAIFinalIndependentReviewFingerprint,
  CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
} from "../lib/code/runtime/CodeAIFinalIndependentReviewRuntime.js";

function stateWithReview({ approvals, forgedCount = null }) {
  const state = {
    base_commit: "a".repeat(40),
    patch: "diff --git a/lib/a.js b/lib/a.js\n+secure change\n",
    files_changed: ["lib/a.js"],
    tests: [{ operation_id: "verify-1", command: "node", args: ["--test", "tests/a.test.mjs"], exit_code: 0 }],
  };
  const quality = { contract: "QUALITY_TEST", risk: "high" };
  const fingerprint = codeAIFinalIndependentReviewFingerprint(state, quality);
  state.final_independent_review = {
    contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
    fingerprint,
    verified: true,
    status: "APPROVED",
    approved_review_count: forgedCount ?? approvals,
    blocking_finding_count: 0,
    reviews: [
      { role: "semantic_integration", success: true, approved: approvals >= 1, verdict: approvals >= 1 ? "approve" : "unable_to_verify" },
      { role: "adversarial_regression", success: true, approved: approvals >= 2, verdict: approvals >= 2 ? "approve" : "unable_to_verify" },
    ],
  };
  return { state, quality };
}

test("high-risk Code changes require consensus from both independent reviewers", () => {
  const one = stateWithReview({ approvals: 1 });
  const oneGate = assessCodeAIFinalIndependentReviewGate(one.state, one.quality);
  assert.equal(oneGate.required, true);
  assert.equal(oneGate.required_approvals, 2);
  assert.equal(oneGate.verified, false);
  assert.equal(oneGate.blocker, "CODE_AI_FINAL_INDEPENDENT_REVIEW_UNAVAILABLE");

  const two = stateWithReview({ approvals: 2 });
  const twoGate = assessCodeAIFinalIndependentReviewGate(two.state, two.quality);
  assert.equal(twoGate.required_approvals, 2);
  assert.equal(twoGate.observed_approvals, 2);
  assert.equal(twoGate.verified, true);
  assert.equal(twoGate.blocker, null);
});


test("stored approval counts cannot spoof missing reviewer consensus", () => {
  const forged = stateWithReview({ approvals: 1, forgedCount: 2 });
  const gate = assessCodeAIFinalIndependentReviewGate(forged.state, forged.quality);
  assert.equal(gate.observed_approvals, 1);
  assert.equal(gate.verified, false);
  assert.equal(gate.blocker, "CODE_AI_FINAL_INDEPENDENT_REVIEW_UNAVAILABLE");
});

test("actual repair verdicts cannot be hidden by a forged zero aggregate", () => {
  const candidate = stateWithReview({ approvals: 2, forgedCount: 0 });
  candidate.state.final_independent_review.reviews.push({
    role: "semantic_integration",
    success: true,
    approved: false,
    verdict: "repair_required",
    blocking_finding_count: 1,
  });
  const gate = assessCodeAIFinalIndependentReviewGate(candidate.state, candidate.quality);
  assert.equal(gate.verified, false);
  assert.equal(gate.blocker, "CODE_AI_FINAL_INDEPENDENT_REVIEW_REPAIR_REQUIRED");
  assert.equal(gate.blocking_finding_count, 1);
});
