import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const utility = await readFile(
  "lib/code/runtime/CodeAIEngineeringMemoryUtilityRuntime.js",
  "utf8",
);
const memory = await readFile(
  "lib/code/runtime/CodeAIVerifiedEngineeringMemoryRuntime.js",
  "utf8",
);
const workPackage = await readFile(
  "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  "utf8",
);
const finalReview = await readFile(
  "lib/code/runtime/CodeAIEmployeeFinalReviewRuntime.js",
  "utf8",
);
const studioRoute = await readFile(
  "app/api/operator/code/mission/route.js",
  "utf8",
);

test("engineering memory utility is observational, scoped and has zero authority", () => {
  assert.match(utility, /AVANTIQO_CODE_AI_ENGINEERING_MEMORY_UTILITY_V1/);
  assert.match(utility, /code_ai_engineering_memory_utility_observation/);
  assert.match(utility, /actor_id/);
  assert.match(utility, /organization_id/);
  assert.match(utility, /OBSERVATIONAL_UTILITY_ONLY/);
  assert.match(utility, /causal_attribution_allowed:\s*false/);
  assert.match(utility, /automatic_knowledge_promotion:\s*false/);
  assert.match(utility, /authorization_effect:\s*"NONE"/);
  assert.match(utility, /commit_authority:\s*false/);
  assert.match(utility, /production_deploy_authority:\s*false/);
});

test("only direct current-head contradiction can penalize a prior Code precedent", () => {
  assert.match(utility, /current_head_direct_stale_signal/);
  assert.match(utility, /cited_paths_stale/);
  assert.match(utility, /remembered_verifier_pre_mutation_failures/);
  assert.match(utility, /direct_current_head_contradiction_required_for_penalty:\s*true/);
  assert.match(utility, /ordinary_mission_failure_causes_penalty:\s*false/);
  assert.match(utility, /SUPPRESSED_AFTER_REPEATED_DIRECT_CURRENT_HEAD_CONTRADICTION/);
  assert.match(utility, /DOWNRANKED_BY_OBSERVED_CURRENT_HEAD_UTILITY/);
});

test("memory utility measures investigation footprint and verified usefulness", () => {
  assert.match(utility, /deterministic_searches_before_first_mutation/);
  assert.match(utility, /deterministic_reads_before_first_mutation/);
  assert.match(utility, /deterministic_discovery_operations_before_first_mutation/);
  assert.match(utility, /reasoning_calls_used/);
  assert.match(utility, /verified_current_mission_complete/);
  assert.match(utility, /useful_completion_signal/);
  assert.match(utility, /investigation_efficiency_observed/);
  assert.match(utility, /average_reasoning_calls/);
  assert.match(utility, /average_discovery_operations_before_first_mutation/);
});

test("verified engineering memory retrieval is utility-ranked and never replays patches", () => {
  assert.match(memory, /loadCodeAIEngineeringMemoryUtilityScores/);
  assert.match(memory, /utility_adjusted_ranking:\s*true/);
  assert.match(memory, /adjusted_relevance_score/);
  assert.match(memory, /ranking_multiplier/);
  assert.match(memory, /suppressed_candidate_count/);
  assert.match(memory, /\.filter\(\(entry\) => entry\.utility\.suppressed !== true\)/);
  assert.match(memory, /current_head_revalidation_required:\s*true/);
  assert.match(memory, /patch_replay_allowed:\s*false/);
  assert.match(memory, /ordinary_mission_failure_causes_penalty:\s*false/);
});

test("utility feedback cannot block Code execution or invalidate a verified result", () => {
  assert.match(workPackage, /safeRecordEngineeringMemoryUtility/);
  assert.match(workPackage, /code_execution_blocked:\s*false/);
  assert.match(workPackage, /code_execution_result_changed:\s*false/);
  assert.match(workPackage, /engineering_memory_utility_failure_blocks_code:\s*false/);
  assert.match(finalReview, /finalResultWithEngineeringMemoryUtility/);
  assert.match(finalReview, /verified_code_result_changed:\s*false/);
  assert.match(finalReview, /engineering_memory_utility_failure_blocks_verified_code:\s*false/);
});

test("Code Studio exposes both the memory and its measured utility receipt", () => {
  assert.match(studioRoute, /verified_engineering_memory:\s*result\?\.verified_engineering_memory/);
  assert.match(studioRoute, /engineering_memory_utility:\s*result\?\.engineering_memory_utility/);
  assert.match(studioRoute, /commit_performed:\s*false/);
  assert.match(studioRoute, /production_deploy_performed:\s*false/);
});
