import assert from "node:assert/strict";

import {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  parseCodeAIWorkPackage,
} from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";

const recovered = parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "implementation",
  summary: "Edit, test and inspect diff.",
  operations: [
    {
      action: "apply_files",
      description: "Apply coherent source changes.",
      input: { files: [{ path: "example.mjs", content: "export const ok = true;\n" }] },
    },
    {
      action: "run",
      description: "Run the exact regression test after the edit.",
      input: { command: "node", args: ["--check", "example.mjs"] },
    },
    {
      action: "diff",
      description: "Inspect final diff.",
      input: {},
    },
  ],
}));

assert.deepEqual(
  recovered.operations.map((operation) => operation.action),
  ["apply_files", "verify", "diff"],
);
assert.equal(
  recovered.controller_normalizations[0]?.kind,
  "PROMOTE_POST_MUTATION_RUN_TO_VERIFY",
);

const recoveredMissingDiff = parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "implementation",
  summary: "Edit and verify while letting the controller own final diff review.",
  operations: [
    {
      action: "apply_files",
      description: "Apply coherent source changes.",
      input: { files: [{ path: "example.mjs", content: "export const ok = true;\n" }] },
    },
    {
      action: "verify",
      description: "Run exact verification after the final edit.",
      input: { command: "node", args: ["--check", "example.mjs"] },
    },
  ],
}));

assert.deepEqual(
  recoveredMissingDiff.operations.map((operation) => operation.action),
  ["apply_files", "verify", "diff"],
);
assert.equal(
  recoveredMissingDiff.controller_normalizations[0]?.kind,
  "APPEND_CONTROLLER_FINAL_DIFF",
);
assert.equal(
  recoveredMissingDiff.operations[2]?.description,
  "Controller-owned final diff review after all mutation and verification work.",
);

const exactMjsVerifier = parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "implementation",
  summary: "Edit while controller owns exact verification and diff.",
  operations: [
    {
      action: "apply_files",
      description: "Apply coherent source changes.",
      input: { files: [{ path: "example.mjs", content: "export const ok = true;\n" }] },
    },
  ],
}), {
  authoritative_verification: {
    command: "node",
    args: ["scripts/code-ai-autonomous-multifile-fixture-test.mjs"],
  },
});
assert.deepEqual(
  exactMjsVerifier.operations.map((operation) => operation.action),
  ["apply_files", "verify", "diff"],
);
assert.deepEqual(
  exactMjsVerifier.operations[1]?.input?.args,
  ["scripts/code-ai-autonomous-multifile-fixture-test.mjs"],
);

assert.throws(() => parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "implementation",
  operations: [
    { action: "apply_files", input: { files: [{ path: "example.mjs", content: "x" }] } },
    { action: "diff", input: {} },
  ],
})), /CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_VERIFICATION/);

await import("./code-ai-repair-convergence-selftest.mjs");
await import("./code-ai-repair-failure-delta-audit.mjs");
await import("./code-ai-seeded-implementation-lock-selftest.mjs");
await import("./code-ai-operator-prewarm-audit.mjs");
await import("./code-ai-live-bounded-work-package-selftest.mjs");
await import("./code-ai-live-progress-lease-audit.mjs");
await import("./code-ai-worker-session-release-audit.mjs");
await import("./code-ai-ready-transport-resilience-audit.mjs");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_RECOVERY_SELFTEST_V10",
  verified: {
    post_mutation_run_promoted_to_verify_without_new_reasoning_call: true,
    controller_owned_final_diff_appended_without_new_reasoning_call: true,
    structured_authoritative_mjs_verifier_preserved_exactly: true,
    missing_post_mutation_verification_still_rejected: true,
    repair_convergence_selftest_included: true,
    repair_failure_delta_audit_v1_included: true,
    verifier_failure_drives_materially_changed_repair_included: true,
    repeated_equivalent_failed_patch_forbidden_included: true,
    reasoning_budget_not_increased_for_repair_included: true,
    seeded_implementation_lock_selftest_v3_included: true,
    deterministic_verify_diff_before_more_reasoning_included: true,
    historical_failed_verification_cleared_by_later_success_included: true,
    successful_existing_implementation_does_not_require_reedit_included: true,
    operator_prewarm_audit_included: true,
    live_bounded_work_package_selftest_included: true,
    live_progress_lease_audit_included: true,
    worker_session_release_audit_included: true,
    failed_session_without_pod_cleanup_regression_included: true,
    ready_transport_resilience_audit_included: true,
    warm_transport_miss_does_not_consume_reasoning_regression_included: true,
    quality_gate_weakened: false,
    provider_calls_executed: false,
    reasoning_calls_consumed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
    production_deploy_performed: false,
  },
}, null, 2));