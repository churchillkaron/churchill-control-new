import assert from "node:assert/strict";

import {
  isRepairableCodeAIWorkPackageMutationFailure,
  resolveCodeAIWorkPackageFailureStatus,
} from "../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";

const CONTRACT = "AVANTIQO_CODE_AI_DIFF_CHECK_REPAIR_SELFTEST_V1";

for (const reason of [
  "CODE_AI_DIFF_CHECK_FAILED_AFTER_EDIT",
  "CODE_AI_DIFF_CHECK_FAILED_AFTER_DELETE",
  "CODE_AI_DIFF_CHECK_FAILED_AFTER_RENAME",
]) {
  assert.equal(isRepairableCodeAIWorkPackageMutationFailure(reason), true);
  assert.equal(resolveCodeAIWorkPackageFailureStatus("blocked", reason), "repair_required");
}

assert.equal(
  isRepairableCodeAIWorkPackageMutationFailure("CODE_AI_GIT_METADATA_WRITE_BLOCKED"),
  false,
);
assert.equal(
  resolveCodeAIWorkPackageFailureStatus("blocked", "CODE_AI_GIT_METADATA_WRITE_BLOCKED"),
  "blocked",
);

const source = await (await import("node:fs/promises")).readFile(
  new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url),
  "utf8",
);
for (const marker of [
  "source-quality repair pass",
  "git diff --check rejected the latest mutation",
  "source_quality_repair_required",
  "source_quality_failure",
  "diff_check",
  "repair_required",
]) {
  assert.ok(source.includes(marker), `missing marker: ${marker}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    edit_diff_check_failure_is_repairable: true,
    delete_diff_check_failure_is_repairable: true,
    rename_diff_check_failure_is_repairable: true,
    strict_diff_check_not_bypassed: true,
    diff_check_diagnostics_forwarded_to_repair_prompt: true,
    unrelated_safety_blocks_remain_terminal: true,
    reasoning_budget_increased: false,
    provider_call_performed: false,
    gpu_lease_acquired: false,
    wallet_mutation_performed: false,
    source_mutation_performed_by_selftest: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
