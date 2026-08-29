import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_REPAIR_FAILURE_DELTA_AUDIT_V1";
const runtimePath = "lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";
const source = await readFile(runtimePath, "utf8");

for (const marker of [
  "Treat the authoritative verifier source and latest_failed_verification as executable specification.",
  "identify the precise semantic mismatch",
  "return a materially changed correction",
  "Do not repeat equivalent source that already produced this failure.",
  "the authoritative verifier and its observed expected/actual assertion behavior disambiguate it",
  "const effectiveRepairState = actionPolicy.repair_state || Boolean(sourceQualityFailure);",
  "repair_requires_material_change: effectiveRepairState",
  "code_ai_repair_requires_material_change: effectiveRepairState",
]) {
  assert.ok(source.includes(marker), `CODE_AI_REPAIR_FAILURE_DELTA_MARKER_MISSING:${marker}`);
}

assert.equal(source.includes("reasoning_call_budget: 5"), false);
assert.equal(source.includes("MAX_CODE_AI_REASONING_CALL_BUDGET = 9"), false);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    verifier_failure_is_executable_specification: true,
    semantic_failure_delta_required: true,
    repeated_equivalent_failed_patch_forbidden: true,
    ambiguous_wording_resolved_by_authoritative_assertions: true,
    repair_material_change_is_structured: true,
    effective_repair_state_covers_verifier_and_source_quality_failures: true,
    reasoning_budget_not_increased: true,
    provider_calls_executed: false,
    reasoning_calls_consumed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
    source_mutation_performed_by_audit: false,
    production_deploy_performed: false,
  },
}, null, 2));
