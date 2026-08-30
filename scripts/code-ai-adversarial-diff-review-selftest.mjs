import assert from "node:assert/strict";

import {
  assessCodeAIWorldClassQuality,
  codeAIVerificationFamily,
  reviewCodeAIWorldClassDiff,
} from "../lib/code/runtime/CodeAIWorldClassQualityPolicy.js";

const CONTRACT = "AVANTIQO_CODE_AI_ADVERSARIAL_DIFF_REVIEW_SELFTEST_V1";

function patch(path, addedLines) {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -1,1 +1,3 @@",
    " existing",
    ...addedLines.map((line) => `+${line}`),
  ].join("\n");
}

function completedState({ path, patchText, command = "node", args = ["--check", path] }) {
  return {
    status: "completed",
    files_changed: [path],
    source_changes: [{ path, operation: "write", content: "changed" }],
    patch: patchText,
    evidence: [
      {
        kind: "operation",
        status: "completed",
        operation_id: "edit_1",
        action: "apply_files",
      },
      {
        kind: "operation",
        status: "completed",
        operation_id: "verify_1",
        action: "verify",
      },
      {
        kind: "operation",
        status: "completed",
        operation_id: "diff_1",
        action: "diff",
      },
    ],
    tests: [{
      operation_id: "verify_1",
      command,
      args,
      exit_code: 0,
    }],
    verification: [{ operation_id: "verify_1", passed: true }],
  };
}

const safe = reviewCodeAIWorldClassDiff({
  patch: patch("lib/example.js", ["export const answer = 42;"]),
});
assert.equal(safe.verified, true);
assert.equal(safe.finding_count, 0);

const focusedTest = reviewCodeAIWorldClassDiff({
  patch: patch("tests/example.test.js", ["test.only('works', () => {});"]),
});
assert.equal(focusedTest.verified, false);
assert.ok(focusedTest.blocking_rules.includes("FOCUSED_OR_SKIPPED_TEST"));

const skippedPython = reviewCodeAIWorldClassDiff({
  patch: patch("tests/test_example.py", ["@pytest.mark.skip(reason='temporary')"]),
});
assert.equal(skippedPython.verified, false);
assert.ok(skippedPython.blocking_rules.includes("PYTHON_TEST_SKIP"));

const tlsBypass = reviewCodeAIWorldClassDiff({
  patch: patch("lib/client.js", ["process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';"]),
});
assert.equal(tlsBypass.verified, false);
assert.ok(tlsBypass.blocking_rules.includes("TLS_VERIFICATION_DISABLED"));

const maskedCi = reviewCodeAIWorldClassDiff({
  patch: patch(".github/workflows/ci.yml", ["      continue-on-error: true"]),
});
assert.equal(maskedCi.verified, false);
assert.ok(maskedCi.blocking_rules.includes("CI_FAILURE_MASKED"));

const neuteredVerification = reviewCodeAIWorldClassDiff({
  patch: patch("package.json", ['    "test": "true"']),
});
assert.equal(neuteredVerification.verified, false);
assert.ok(neuteredVerification.blocking_rules.includes("VERIFICATION_SCRIPT_NEUTERED"));

const suppressionState = completedState({
  path: "lib/example.js",
  patchText: patch("lib/example.js", ["// @ts-ignore", "callRiskyThing();"]),
});
const suppressionQuality = assessCodeAIWorldClassQuality(suppressionState);
assert.equal(suppressionQuality.path_risk, "standard");
assert.equal(suppressionQuality.risk, "high");
assert.equal(suppressionQuality.adversarial_diff_review.verified, true);
assert.ok(
  suppressionQuality.adversarial_diff_review.escalation_rules.includes(
    "STATIC_ANALYSIS_SUPPRESSION",
  ),
);
assert.equal(suppressionQuality.required_verification_gates, 2);
assert.equal(suppressionQuality.verified, false);
assert.ok(
  suppressionQuality.blockers.some((blocker) =>
    blocker.startsWith("CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED:"),
  ),
);

const blockedState = completedState({
  path: "tests/example.test.js",
  patchText: patch("tests/example.test.js", ["test.skip('broken', () => {});"]),
});
const blockedQuality = assessCodeAIWorldClassQuality(blockedState);
assert.equal(blockedQuality.verified, false);
assert.ok(
  blockedQuality.blockers.some((blocker) =>
    blocker.includes("CODE_AI_WORLDCLASS_ADVERSARIAL_DIFF_REVIEW_REQUIRED"),
  ),
);
assert.deepEqual(
  blockedQuality.required_next_actions,
  ["apply_files", "verify", "diff"],
);

assert.equal(
  codeAIVerificationFamily({ command: "node", args: ["scripts/preflight-code.mjs"] }),
  "audit",
);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    safe_diff_allowed: true,
    focused_or_skipped_tests_blocked: true,
    python_test_skip_blocked: true,
    tls_verification_bypass_blocked: true,
    ci_failure_masking_blocked: true,
    verification_script_neutering_blocked: true,
    static_analysis_suppression_escalates_risk: true,
    escalated_risk_requires_more_independent_verification: true,
    adversarial_block_requires_repair_verify_diff: true,
    audit_preflight_verification_family_distinct: true,
  },
  provider_call_performed: false,
  provider_spend_performed: false,
  source_mutation_performed_by_selftest: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);