import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Studio research recovery stays Node01-first and preserves failed approval state", () => {
  const researchRuntime = read("lib/creative/research/runtime/ResearchRuntime.js");
  const director = read("lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js");
  const runner = read("scripts/creative-one-clip.mjs");
  const worker = read("scripts/local-node/avantiqo-node01-worker.ps1");

  assert.match(researchRuntime, /repairableFailure/);
  assert.match(researchRuntime, /repairCompletedSynthesis/);
  assert.match(researchRuntime, /REPAIR_FAILED/);

  assert.match(director, /AVANTIQO_INTELLIGENCE_LOCAL_MODEL/);
  assert.match(director, /function localResearchSynthesisEnabled\(\)/);
  assert.match(director, /function compactLocalResearchPrompt/);
  assert.match(director, /function bindLocalResearchEvidence/);
  assert.match(director, /provider_id: localRepair \? "avantiqo-intelligence" : approval\.provider/);
  assert.match(director, /provider_id: localSynthesis \? "avantiqo-intelligence" : approval\.provider/);
  assert.match(director, /execution_scope: "BENCHMARK_REVIEW_PREVIEW"/);
  assert.match(director, /owned_only_required: true/);
  assert.match(director, /external_fallback_allowed: false/);
  assert.match(director, /max_output_tokens: localRepair \? 2200 : 3000/);
  assert.match(director, /estimatedSynthesisOutputTokens = localSynthesis \? 3000 : 12000/);
  assert.equal((director.match(/const localBenchmark = localResearchSynthesisEnabled\(\);/g) || []).length, 2);
  assert.equal((director.match(/provider_id: localBenchmark \? "avantiqo-intelligence" : approval\.provider/g) || []).length, 2);
  assert.equal((director.match(/external_fallback_allowed: false/g) || []).length >= 4, true);
  assert.equal((director.match(/provider_id: approval\.provider/g) || []).length, 0);
  assert.match(director, /approval_reusable_after_failure_with_remaining_budget: approvalHasRemainingBudget/);

  assert.match(runner, /preserveResearchRecovery/);
  assert.match(runner, /existingResearchApproval\.retry_required === true/);
  assert.match(runner, /"VALIDATION_FAILED", "EXECUTION_FAILED", "REPAIR_FAILED"/);

  assert.match(worker, /'ai\.reasoning\.execute'/);
  assert.match(worker, /@\('ai\.text\.generate','ai\.reasoning\.execute'\)/);
});
