import assert from "node:assert/strict";

import {
  runCodeAIParallelSpecialistReview,
  resolveCodeAIParallelSpecialistReviewNeed,
  formatCodeAIParallelSpecialistReviewForObjective,
  CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
} from "../lib/code/runtime/CodeAIParallelSpecialistReviewRuntime.js";

const standardNeed = resolveCodeAIParallelSpecialistReviewNeed({
  objective: "Fix the typo in lib/example.js",
  repository_impact: { risk: "standard" },
});
assert.equal(standardNeed.required, false);
assert.equal(standardNeed.ordinary_standard_work_should_skip, true);

const strategicNeed = resolveCodeAIParallelSpecialistReviewNeed({
  objective: "Improve concurrency architecture and latency without breaking API contracts",
  repository_impact: { risk: "high" },
});
assert.equal(strategicNeed.required, true);
assert.equal(strategicNeed.reviewer_count_when_required, 2);

let active = 0;
let peakActive = 0;
let calls = 0;
const seen = [];
async function mockedReasoning(input) {
  calls += 1;
  active += 1;
  peakActive = Math.max(peakActive, active);
  seen.push({
    lane: input.execution_lane,
    tool_count: input.tools.length,
    authorization: input.authorization,
    max_turns: input.max_turns,
    prompt: input.input,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  active -= 1;
  return {
    success: true,
    provider: "avantiqo-intelligence",
    model: input.execution_lane === "deep" ? "deep-test" : "fast-test",
    execution_lane: input.execution_lane,
    text: JSON.stringify({
      recommendation: input.execution_lane === "deep"
        ? "Prefer bounded queue ownership and explicit backpressure."
        : "Preserve API compatibility and verify failure paths.",
      alternative: input.execution_lane === "deep"
        ? "Keep serial execution if contention evidence is absent."
        : null,
      risks: input.execution_lane === "deep"
        ? ["queue starvation"]
        : ["compatibility regression"],
      verification: input.execution_lane === "deep"
        ? ["load test"]
        : ["contract test"],
      confidence: 0.9,
    }),
    turns: 1,
    tool_calls_executed: 0,
  };
}

const input = {
  context: { organizationId: "org-test" },
  objective: "Improve concurrency architecture and latency without breaking API contracts",
  state: {
    base_commit: "a".repeat(40),
    evidence: [],
    source_changes: [],
    files_changed: [],
  },
  repository_impact: {
    risk: "high",
    observed_path_count: 4,
    observed_paths: ["lib/a.js", "lib/b.js", "app/api/x/route.js", "tests/x.test.js"],
    impact_categories: ["runtime_service", "api_contract", "test"],
  },
  external_research: { required: false, status: "NOT_REQUIRED" },
  dependencies: { runReasoning: mockedReasoning },
};

const result = await runCodeAIParallelSpecialistReview(input);
assert.equal(result.contract, CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT);
assert.equal(result.status, "COMPLETED");
assert.equal(result.completed, true);
assert.equal(result.concurrent_dispatch, true);
assert.equal(result.reviewer_count_requested, 2);
assert.equal(result.reviewer_count_succeeded, 2);
assert.equal(result.additional_code_reasoning_calls_consumed, 0);
assert.equal(result.source_mutation_authority, false);
assert.equal(result.single_writer_code_implementation_preserved, true);
assert.ok(peakActive >= 2, "reviewers must actually overlap, not execute serially");
assert.equal(calls, 2);
assert.deepEqual(new Set(seen.map((entry) => entry.lane)), new Set(["fast", "deep"]));
for (const entry of seen) {
  assert.equal(entry.tool_count, 0);
  assert.deepEqual(entry.authorization, {});
  assert.equal(entry.max_turns, 1);
  assert.match(entry.prompt, /no tools or mutation authority/i);
}

const formatted = formatCodeAIParallelSpecialistReviewForObjective(result);
assert.match(formatted, /INDEPENDENT PARALLEL SPECIALIST REVIEWS/);
assert.match(formatted, /ADVISORY EVIDENCE ONLY/);
assert.match(formatted, /no write\/deploy\/migration\/credential authority/i);

const reused = await runCodeAIParallelSpecialistReview({
  ...input,
  existing: result,
});
assert.equal(reused.reused_from_attested_resume_state, true);
assert.equal(reused.specialist_reasoning_calls_requested, 0);
assert.equal(calls, 2, "resume reuse must not make new specialist calls");

let partialCalls = 0;
const partial = await runCodeAIParallelSpecialistReview({
  ...input,
  dependencies: {
    runReasoning: async (reviewInput) => {
      partialCalls += 1;
      if (reviewInput.execution_lane === "fast") {
        throw new Error("FAST_REVIEW_UNAVAILABLE");
      }
      return mockedReasoning(reviewInput);
    },
  },
});
assert.equal(partial.status, "PARTIAL");
assert.equal(partial.completed, true);
assert.equal(partial.reviewer_count_succeeded, 1);
assert.equal(partialCalls, 2);

const skipped = await runCodeAIParallelSpecialistReview({
  context: { organizationId: "org-test" },
  objective: "Fix the typo in lib/example.js",
  state: { base_commit: "b".repeat(40), evidence: [] },
  repository_impact: { risk: "standard" },
  dependencies: {
    runReasoning: async () => {
      throw new Error("SHOULD_NOT_RUN");
    },
  },
});
assert.equal(skipped.status, "NOT_REQUIRED");
assert.equal(skipped.reviewer_count_requested, 0);
assert.equal(skipped.specialist_reasoning_calls_requested, 0);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_PARALLEL_SPECIALIST_REVIEW_SELFTEST_V1",
  council_contract: CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
  true_concurrent_dispatch_proven: peakActive >= 2,
  reviewer_lanes: seen.map((entry) => entry.lane).sort(),
  mutation_tools_available: false,
  source_mutation_authority: false,
  ordinary_standard_work_skips_council: true,
  partial_review_tolerated: true,
  attested_resume_reuse_semantics_proven: true,
  provider_call_performed_by_selftest: false,
  provider_spend_performed_by_selftest: false,
  source_mutation_performed_by_selftest: false,
  production_deploy_performed: false,
  raw_reasoning_persisted: false,
}, null, 2));