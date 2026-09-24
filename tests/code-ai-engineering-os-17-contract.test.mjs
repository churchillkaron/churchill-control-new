import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const os = await readFile(new URL("../lib/code/runtime/CodeAIEngineeringOperatingSystemRuntime.js", import.meta.url), "utf8");
const mission = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");
const history = await readFile(new URL("../lib/code/runtime/CodeAIMissionHistoryRuntime.js", import.meta.url), "utf8");
const github = await readFile(new URL("../lib/code/runtime/CodeGitHubCommitRuntime.js", import.meta.url), "utf8");
const multiRepo = await readFile(new URL("../lib/code/runtime/CodeAIMultiRepositoryMissionRuntime.js", import.meta.url), "utf8");
const benchmark = await readFile(new URL("../lib/code/runtime/CodeAIHiddenBenchmarkRuntime.js", import.meta.url), "utf8");
const capability = await readFile(new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url), "utf8");
const commit = await readFile(new URL("../lib/platform/capabilities/createCodeAICommitCapability.js", import.meta.url), "utf8");
const release = await readFile(new URL("../lib/platform/capabilities/createProductProductionReleaseCapability.js", import.meta.url), "utf8");
const studio = await readFile(new URL("../components/creative/code/CreativeCodeStudio.jsx", import.meta.url), "utf8");

test("Engineering OS covers all seventeen requested upgrade departments", () => {
  for (let id = 1; id <= 17; id += 1) assert.match(os, new RegExp(`id: ${id},`), `missing department ${id}`);
  assert.match(os, /Persistent Architecture Brain/);
  assert.match(os, /Multi-agent engineering team/);
  assert.match(os, /Reproduction-first engineering/);
  assert.match(os, /Hypothesis-based debugging/);
  assert.match(os, /Durable mission runtime/);
  assert.match(os, /Browser\/computer verification/);
  assert.match(os, /Database engineering department/);
  assert.match(os, /Branch, PR and multi-repository governance/);
  assert.match(os, /Adversarial test generation/);
  assert.match(os, /Runtime observability reasoning/);
  assert.match(os, /Performance\/regression evidence/);
  assert.match(os, /Security engineering reviewer/);
  assert.match(os, /Verified engineering memory/);
  assert.match(os, /Verified-mission self-improvement/);
  assert.match(os, /Dynamic intelligence routing/);
  assert.match(os, /Autonomous engineering program manager/);
  assert.match(os, /Hidden engineering benchmark certification/);
});

test("architecture brain persists through attested scoped history and requires head revalidation", () => {
  assert.match(history, /loadLatestCodeAIArchitectureBrainSnapshot/);
  assert.match(history, /integrity\.valid/);
  assert.match(history, /current_head_revalidation_required: true/);
  assert.match(capability, /prior_architecture_brain: priorArchitectureBrain/);
});

test("debugging database security performance and observability are durable typed mission evidence", () => {
  for (const action of ["record_reproduction","record_hypotheses","record_database_review","record_security_review","record_performance_evidence","record_observability_evidence"]) assert.match(mission, new RegExp(`case "${action}"`));
  assert.match(mission, /AVANTIQO_CODE_REPRODUCTION_EVIDENCE_V1/);
  assert.match(mission, /AVANTIQO_CODE_HYPOTHESIS_DEBUGGING_V1/);
  assert.match(mission, /AVANTIQO_CODE_DATABASE_ENGINEERING_REVIEW_V1/);
  assert.match(mission, /AVANTIQO_CODE_SECURITY_ENGINEERING_REVIEW_V1/);
  assert.match(mission, /AVANTIQO_CODE_PERFORMANCE_EVIDENCE_V1/);
  assert.match(mission, /CODE_AI_PERFORMANCE_BENCHMARK_KEY_REQUIRED/);
  assert.match(mission, /CODE_AI_PERFORMANCE_DISTINCT_BEFORE_AFTER_OPERATIONS_REQUIRED/);
  assert.match(mission, /CODE_AI_PERFORMANCE_BEFORE_AFTER_EVIDENCE_MISMATCH/);
  assert.match(mission, /CODE_AI_PERFORMANCE_DIRECTION_REQUIRED/);
  assert.match(mission, /CODE_AI_PERFORMANCE_CLAIM_NOT_SUPPORTED_BY_MEASUREMENTS/);
  assert.match(mission, /minimum_improvement_percent/);
  assert.match(mission, /measured_improvement_percent/);
  assert.match(mission, /direction === "lower_is_better"/);
  assert.match(mission, /after < before/);
  assert.match(mission, /after > before/);
  assert.match(mission, /AVANTIQO_CODE_OBSERVABILITY_EVIDENCE_V1/);
  assert.match(mission, /function assertObservedEvidenceOperationIds/);
  assert.match(mission, /"CODE_AI_DATABASE_REVIEW"/);
  assert.match(mission, /"CODE_AI_SECURITY_REVIEW"/);
  assert.match(mission, /"CODE_AI_PERFORMANCE"/);
  assert.match(mission, /"CODE_AI_OBSERVABILITY"/);
  assert.match(mission, /_EVIDENCE_REQUIRED/);
  assert.match(mission, /_EVIDENCE_NOT_OBSERVED/);
  assert.match(mission, /_EVIDENCE_INCOMPLETE/);
});

test("review workflow creates draft PR from verified exact head and never merges automatically", () => {
  assert.match(github, /createVerifiedCodeMissionPullRequest/);
  assert.match(github, /draft: true/);
  assert.match(github, /merge_performed: false/);
  assert.match(github, /CODE_AI_GITHUB_BASE_COMMIT_MOVED_REPLAN_REQUIRED/);
  assert.match(studio, /Create review PR/);
  assert.match(studio, /\/api\/operator\/code\/review/);
});

test("multi repository missions keep independent heads and no merge authority", () => {
  assert.match(multiRepo, /independent_heads_required:true/);
  assert.match(multiRepo, /independent_verification_required:true/);
  assert.match(multiRepo, /merge_authority:false/);
  assert.match(multiRepo, /DEPENDENCY_CYCLE/);
});

test("hidden benchmark prevents expected answers from entering candidate surface", () => {
  assert.match(benchmark, /createHmac\("sha256",\s*salt\)/);
  assert.match(benchmark, /expected_values_exposed_to_candidate:\s*false/);
  assert.match(benchmark, /held_out:\s*true/);
  assert.match(benchmark, /pass_rate/);
});

test("new Engineering OS proof is a server-side commit choke point and production release cannot bypass it", () => {
  assert.match(commit, /assertCodeAIEngineeringOSCommitReady\(missionState\)/);
  assert.match(release, /capability: "code_ai_commit"/);
  assert.match(release, /commitResult\?\.verified !== true/);
});

test("routing remains owned local first and expensive escalation is bounded", () => {
  assert.match(os, /NODE01_LOCAL_FIRST/);
  assert.match(os, /external_frontier_allowed: false/);
  assert.match(os, /OWNER_GOVERNED_ESCALATION_APPROVED/);
  assert.match(os, /cost_surprise_allowed: false/);
});
