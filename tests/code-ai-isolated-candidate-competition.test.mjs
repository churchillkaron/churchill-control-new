import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  runCodeAIIsolatedCandidateCompetition,
} from "../lib/code/runtime/CodeAIIsolatedCandidateCompetitionRuntime.js";

function competition() {
  return {
    ranked: [
      { id: "strategy_a", direction: "Reuse the canonical runtime boundary." },
      { id: "strategy_b", direction: "Move responsibility into the caller lifecycle." },
    ],
  };
}

function completedResult(input, failureCount = 0) {
  const index = String(input.objective).includes("Candidate 1") ? 1 : 2;
  return {
    success: true,
    status: "completed",
    state: {
      mission_id: input.resume_state.mission_id,
      files_changed: [`lib/candidate-${index}.js`],
      patch: `diff --git a/lib/candidate-${index}.js b/lib/candidate-${index}.js`,
      verification: [{ passed: true }],
      failures: Array.from({ length: failureCount }, () => ({ message: "trial failure" })),
      work_package_control: { reasoning_calls_used: 1 },
    },
  };
}

test("isolated candidate competition executes two ephemeral candidates and selects the stronger completed result", async () => {
  const seen = [];
  const result = await runCodeAIIsolatedCandidateCompetition({
    policy: { enabled: true },
    strategy_competition: competition(),
    input: {
      objective: "Repair a high-risk runtime defect.",
      repository_url: "https://github.com/example/repo",
      ref: "main",
    },
    resume_state: {
      mission_id: "mission-123",
      work_package_control: { reasoning_calls_used: 0 },
    },
    dependencies: {
      executeCandidate: async (input) => {
        seen.push(input);
        return completedResult(input, String(input.objective).includes("Candidate 2") ? 1 : 0);
      },
    },
  });

  assert.equal(seen.length, 2);
  assert.notEqual(seen[0].resume_state.mission_id, seen[1].resume_state.mission_id);
  assert.match(seen[0].resume_state.mission_id, /candidate:1$/);
  assert.match(seen[1].resume_state.mission_id, /candidate:2$/);
  assert.equal(seen[0].reasoning_call_budget, 1);
  assert.equal(seen[1].reasoning_call_budget, 1);
  assert.equal(seen[0].context.metadata.codeAIIsolatedCandidateTrial, true);
  assert.equal(seen[1].context.metadata.codeAIIsolatedCandidateTrial, true);
  assert.equal(seen[0].context.metadata.codeAIIsolatedCandidateParentMissionId, "mission-123");
  assert.equal(seen[1].context.metadata.codeAIIsolatedCandidateParentMissionId, "mission-123");
  assert.equal(result.executed, true);
  assert.equal(result.concurrent_execution, true);
  assert.equal(result.winner_index, 1);
  assert.equal(result.fallback_to_single_writer_required, false);
  assert.equal(result.main_branch_parallel_mutation_forbidden, true);
  assert.equal(result.shared_live_progress_suppressed_for_candidates, true);
  assert.equal(result.parent_mission_progress_authoritative, true);
  assert.equal(result.reasoning_calls_consumed, 2);
  assert.equal(result.parent_reasoning_calls_after_competition, 2);
  assert.equal(result.commit_authority, false);
  assert.equal(result.deploy_authority, false);
});



test("isolated candidate competition never overspends the parent reasoning budget", async () => {
  let calls = 0;
  const result = await runCodeAIIsolatedCandidateCompetition({
    policy: { enabled: true },
    strategy_competition: competition(),
    input: {
      objective: "Repair high-risk runtime",
      repository_url: "https://github.com/example/repo",
      reasoning_call_budget: 2,
    },
    resume_state: {
      mission_id: "mission-budget",
      work_package_control: { reasoning_calls_used: 1 },
    },
    dependencies: {
      executeCandidate: async () => {
        calls += 1;
        return { success: true, status: "completed", state: {} };
      },
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.executed, false);
  assert.equal(result.status, "NOT_RUN_INSUFFICIENT_REASONING_BUDGET");
  assert.equal(result.reasoning_calls_required_for_competition, 2);
  assert.equal(result.reasoning_calls_consumed, 0);
  assert.equal(result.fallback_to_single_writer_required, true);
});

test("candidate competition falls back when neither isolated implementation proves completion", async () => {
  let calls = 0;
  const result = await runCodeAIIsolatedCandidateCompetition({
    policy: { enabled: true },
    strategy_competition: competition(),
    input: { objective: "Repair ambiguous runtime", repository_url: "https://github.com/example/repo" },
    resume_state: { mission_id: "mission-456" },
    dependencies: {
      executeCandidate: async (input) => {
        calls += 1;
        return {
          success: false,
          status: "verification_required",
          reason: "MORE_EVIDENCE_REQUIRED",
          state: {
            mission_id: input.resume_state.mission_id,
            files_changed: ["lib/incomplete.js"],
            failures: [],
            verification: [],
            work_package_control: { reasoning_calls_used: 1 },
          },
        };
      },
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "NO_PROVEN_WINNER");
  assert.equal(result.winner_result, null);
  assert.equal(result.fallback_to_single_writer_required, true);
});

test("strategic runtime invokes isolated competition only through the governed policy", async () => {
  const strategic = await readFile(
    "lib/code/runtime/CodeAIStrategicReasoningRuntime.js",
    "utf8",
  );
  assert.match(strategic, /resolveCodeAIIsolatedCandidateCompetitionPolicy/);
  assert.match(strategic, /runCodeAIIsolatedCandidateCompetition/);
  assert.match(strategic, /selectedCandidateResult/);
  assert.match(strategic, /fallback_to_single_writer_required|winner_result/);
  assert.match(strategic, /trialReasoningCallsConsumed/);
  assert.match(strategic, /parentReasoningCallsAfterCompetition/);
  assert.match(strategic, /reasoning_calls_used: parentReasoningCallsAfterCompetition/);
});


test("isolated candidate trials cannot overwrite shared parent live progress", async () => {
  const live = await readFile("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");
  const deterministic = await readFile(
    "lib/code/runtime/CodeAIWorkPackageDeterministicConvergenceRuntime.js",
    "utf8",
  );
  assert.match(live, /codeAIIsolatedCandidateTrial === true/);
  assert.match(live, /CODE_AI_ISOLATED_CANDIDATE_LIVE_PROGRESS_SUPPRESSED/);
  assert.match(deterministic, /codeAIIsolatedCandidateTrial === true/);
  assert.match(deterministic, /CODE_AI_ISOLATED_CANDIDATE_DETERMINISTIC_PROGRESS_SUPPRESSED/);
  assert.ok(
    live.indexOf("codeAIIsolatedCandidateTrial === true") <
      live.indexOf("await publishCodeAILiveProgress"),
  );
  assert.ok(
    deterministic.indexOf("codeAIIsolatedCandidateTrial === true") <
      deterministic.indexOf("await publishCodeAILiveProgress"),
  );
});
