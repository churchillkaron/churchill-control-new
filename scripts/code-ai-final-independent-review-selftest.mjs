import assert from "node:assert/strict";

import {
  assessCodeAIFinalIndependentReviewGate,
  codeAIFinalIndependentReviewFingerprint,
  codeAIFinalIndependentReviewRequiredForRisk,
  CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
} from "../lib/code/runtime/CodeAIFinalIndependentReviewRuntime.js";

function quality(risk) {
  return {
    contract: "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
    verified: true,
    risk,
    changed_file_count: 1,
    required_verification_gates: risk === "critical" ? 3 : risk === "high" ? 2 : 1,
    fresh_verification_gate_count: risk === "critical" ? 3 : risk === "high" ? 2 : 1,
    fresh_verification_family_count: risk === "critical" ? 3 : risk === "high" ? 2 : 1,
    fresh_verification_families: risk === "critical"
      ? ["tests", "syntax", "command:git"]
      : risk === "high"
        ? ["tests", "syntax"]
        : ["tests"],
    explicit_final_diff_review: true,
    source_manifest_matches_workspace: true,
    adversarial_diff_review: { verified: true },
    blockers: [],
  };
}

function state(risk) {
  return {
    base_commit: "a".repeat(40),
    status: "completed",
    files_changed: [risk === "critical" ? "lib/auth/AccessPolicy.js" : "lib/code/Feature.js"],
    source_changes: [{
      path: risk === "critical" ? "lib/auth/AccessPolicy.js" : "lib/code/Feature.js",
      operation: "write",
      content: "export const ok = true;\n",
    }],
    patch: "diff --git a/x b/x\n+export const ok = true;\n",
    tests: [
      { operation_id: "verify_1", command: "npm", args: ["test"], exit_code: 0 },
      { operation_id: "verify_2", command: "node", args: ["--check", "lib/code/Feature.js"], exit_code: 0 },
      { operation_id: "verify_3", command: "git", args: ["diff", "--check"], exit_code: 0 },
    ],
    worldclass_quality: quality(risk),
  };
}

assert.equal(codeAIFinalIndependentReviewRequiredForRisk("standard"), false);
assert.equal(codeAIFinalIndependentReviewRequiredForRisk("high"), true);
assert.equal(codeAIFinalIndependentReviewRequiredForRisk("critical"), true);

const standard = state("standard");
const standardGate = assessCodeAIFinalIndependentReviewGate(standard, quality("standard"));
assert.equal(standardGate.required, false);
assert.equal(standardGate.verified, true);

const high = state("high");
const highFingerprint = codeAIFinalIndependentReviewFingerprint(high, quality("high"));
let highGate = assessCodeAIFinalIndependentReviewGate(high, quality("high"));
assert.equal(highGate.required, true);
assert.equal(highGate.verified, false);
assert.equal(highGate.blocker, "CODE_AI_FINAL_INDEPENDENT_REVIEW_REQUIRED");

high.final_independent_review = {
  contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
  status: "APPROVED",
  verified: true,
  fingerprint: highFingerprint,
  approved_review_count: 1,
  blocking_finding_count: 0,
};
highGate = assessCodeAIFinalIndependentReviewGate(high, quality("high"));
assert.equal(highGate.verified, true);
assert.equal(highGate.required_approvals, 1);

const critical = state("critical");
const criticalFingerprint = codeAIFinalIndependentReviewFingerprint(critical, quality("critical"));
critical.final_independent_review = {
  contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
  status: "APPROVED",
  verified: true,
  fingerprint: criticalFingerprint,
  approved_review_count: 1,
  blocking_finding_count: 0,
};
let criticalGate = assessCodeAIFinalIndependentReviewGate(critical, quality("critical"));
assert.equal(criticalGate.verified, false);
assert.equal(criticalGate.required_approvals, 2);
assert.equal(criticalGate.blocker, "CODE_AI_FINAL_INDEPENDENT_REVIEW_UNAVAILABLE");

critical.final_independent_review.approved_review_count = 2;
criticalGate = assessCodeAIFinalIndependentReviewGate(critical, quality("critical"));
assert.equal(criticalGate.verified, true);

critical.patch += "+const changed = true;\n";
criticalGate = assessCodeAIFinalIndependentReviewGate(critical, quality("critical"));
assert.equal(criticalGate.verified, false);
assert.equal(criticalGate.blocker, "CODE_AI_FINAL_INDEPENDENT_REVIEW_STALE");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_FINAL_INDEPENDENT_REVIEW_SELFTEST_V1",
  standard_review_skipped: true,
  high_requires_one_approval: true,
  critical_requires_two_approvals: true,
  patch_change_invalidates_review: true,
  provider_execution_submitted: false,
  model_inference_performed: false,
  source_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));