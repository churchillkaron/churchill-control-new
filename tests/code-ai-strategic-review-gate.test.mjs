import test from "node:test";
import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";
import {
  assessCodeAIStrategicReviewGate,
} from "../lib/code/runtime/CodeAIStrategicReviewGateRuntime.js";
import {
  runCodeAIParallelSpecialistReview,
} from "../lib/code/runtime/CodeAIParallelSpecialistReviewRuntime.js";

function operation(operation_id, action, result = {}) {
  return { kind: "operation", operation_id, action, status: "completed", result };
}

function strategicallyCompleteState(review = null) {
  return {
    status: "completed",
    objective: "Improve architecture performance and reliability for this runtime.",
    files_changed: ["lib/example.js"],
    source_changes: [{ path: "lib/example.js", operation: "write", content: "export default true;\n" }],
    tests: [{ operation_id: "verify_1", command: "node", args: ["--test", "tests/example.test.mjs"], exit_code: 0 }],
    verification: [{ operation_id: "verify_1", passed: true }],
    patch: "diff --git a/lib/example.js b/lib/example.js",
    evidence: [
      operation("apply_1", "apply_files"),
      operation("verify_1", "verify", { exit_code: 0 }),
      operation("diff_1", "diff", { patch: "diff" }),
    ],
    repository_impact: { risk: "standard" },
    parallel_specialist_review: review,
  };
}
test("strategic employee completion fails closed without both independent reviewers", () => {
  const state = strategicallyCompleteState(null);
  const gate = assessCodeAIStrategicReviewGate(state);

  assert.equal(gate.required, true);
  assert.equal(gate.verified, false);
  assert.ok(gate.blockers.includes("CODE_AI_EMPLOYEE_STRATEGIC_REVIEW_REQUIRED"));
});

test("strategic employee completion accepts a complete two-role specialist council", () => {
  const review = {
    contract: "AVANTIQO_CODE_AI_PARALLEL_SPECIALIST_REVIEW_V1",
    status: "COMPLETED",
    completed: true,
    reviewer_count_succeeded: 2,
    architecture_performance_review_present: true,
    adversarial_risk_review_present: true,
    reviews: [{ role: "architecture_performance", success: true }, { role: "adversarial_risk", success: true }],
  };
  const state = strategicallyCompleteState(review);
  const gate = assessCodeAIStrategicReviewGate(state);

  assert.equal(gate.required, true);
  assert.equal(gate.verified, true);
  assert.deepEqual(gate.blockers, []);
});
test("partial specialist council is retried instead of being reused as complete", async () => {
  const context = { organizationId: "org-test" };
  const objective = "Improve architecture performance and security for this runtime.";
  const repositoryImpact = { risk: "high" };
  let firstCalls = 0;

  const partial = await runCodeAIParallelSpecialistReview({
    context,
    objective,
    state: { base_commit: "abc123" },
    repository_impact: repositoryImpact,
    dependencies: {
      runReasoning: async ({ metadata }) => {
        firstCalls += 1;
        if (metadata.code_ai_specialist_role === "adversarial_risk") {
          throw new Error("TRANSIENT_REVIEW_FAILURE");
        }
        return { success: true, text: JSON.stringify({ recommendation: "keep bounded", alternative: "centralize", risks: [], verification: [], confidence: 0.8 }) };
      },
    },
  });
  assert.equal(firstCalls, 2);
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.reviewer_count_succeeded, 1);

  let retryCalls = 0;
  const retried = await runCodeAIParallelSpecialistReview({
    context,
    objective,
    state: { base_commit: "abc123" },
    repository_impact: repositoryImpact,
    existing: partial,
    dependencies: {
      runReasoning: async () => {
        retryCalls += 1;
        return { success: true, text: JSON.stringify({ recommendation: "bounded repair", alternative: "larger refactor", risks: [], verification: [], confidence: 0.9 }) };
      },
    },
  });

  assert.equal(retryCalls, 2);
  assert.equal(retried.status, "COMPLETED");
  assert.equal(retried.reviewer_count_succeeded, 2);
  assert.equal(retried.reused_from_attested_resume_state, false);
});


test("employee completion is wired to the strategic review gate", async () => {
  const employee = await readFile("lib/code/runtime/CodeAIEmployeeRuntime.js", "utf8");
  assert.match(employee, /assessCodeAIStrategicReviewGate/);
  assert.match(employee, /strategic_review_required_when_risk_or_ambiguity_demands:\s*true/);
  assert.match(employee, /CODE_AI_EMPLOYEE_STRATEGIC_REVIEW_REQUIRED|strategicReview\.blockers/);
});

test("high-risk commit cannot bypass the strategic review gate", async () => {
  const { assertCodeAIWorldClassCommitReady } = await import("../lib/code/runtime/CodeAIWorldClassCommitGuard.js");
  assert.throws(
    () => assertCodeAIWorldClassCommitReady({
      objective: "Refactor architecture and reliability of the governed runtime.",
      worldclass_quality: {
        contract: "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
        verified: true,
        blockers: [],
        changed_file_count: 1,
        explicit_final_diff_review: true,
        source_manifest_matches_workspace: true,
        adversarial_diff_review: { verified: true },
        risk: "high",
        required_verification_gates: 2,
        fresh_verification_gate_count: 2,
        fresh_verification_family_count: 2,
        fresh_verification_families: ["tests", "typecheck"],
      },
    }),
    /CODE_AI_COMMIT_STRATEGIC_REVIEW_REQUIRED/,
  );
});
