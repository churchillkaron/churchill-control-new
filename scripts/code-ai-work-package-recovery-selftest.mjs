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

assert.throws(() => parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "implementation",
  operations: [
    { action: "apply_files", input: { files: [{ path: "example.mjs", content: "x" }] } },
    { action: "diff", input: {} },
  ],
})), /CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_VERIFICATION/);

assert.throws(() => parseCodeAIWorkPackage(JSON.stringify({
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "implementation",
  operations: [
    { action: "apply_files", input: { files: [{ path: "example.mjs", content: "x" }] } },
    { action: "verify", input: { command: "node", args: ["--check", "example.mjs"] } },
  ],
})), /CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_DIFF/);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_RECOVERY_SELFTEST_V1",
  verified: {
    post_mutation_run_promoted_to_verify_without_new_reasoning_call: true,
    missing_post_mutation_verification_still_rejected: true,
    missing_post_mutation_diff_still_rejected: true,
    quality_gate_weakened: false,
    provider_calls_executed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
  },
}, null, 2));
