import test from "node:test";
import assert from "node:assert/strict";

import {
  compileOwnedCognitivePlan,
} from "../lib/operator/runtime/OperatorOwnedCognitivePlanRuntime.js";

function analysisStep(id, overrides = {}) {
  return {
    id,
    title: `Analyze ${id}`,
    kind: "analysis",
    depends_on: [],
    evidence_needed: ["Current source evidence"],
    expected_output: "A verified decision-ready result.",
    verification: {
      required: true,
      criteria: ["Result is supported by current evidence."],
      evidence_required: ["Current evidence reference"],
    },
    ...overrides,
  };
}

test("single-plan input remains backward compatible", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Produce a verified recommendation",
    completion_test: ["Recommendation is evidence-backed."],
    plan_steps: [analysisStep("analyze")],
  });

  assert.equal(result.status, "PLAN_VALIDATED");
  assert.equal(result.planning_complete, true);
  assert.equal(result.plan_competition.mode, "SINGLE_PLAN_COMPATIBILITY");
  assert.equal(result.plan_competition.candidate_count, 1);
  assert.equal(result.plan_competition.selected_candidate_id, "primary");
});

test("competition selects stronger evidence and verification plan instead of first candidate", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Choose the strongest governed approach",
    plan_candidates: [
      {
        candidate_id: "first-plausible",
        plan_steps: [
          analysisStep("inspect", {
            evidence_needed: [],
            verification: { required: false, criteria: [] },
          }),
          analysisStep("compare", {
            evidence_needed: [],
            verification: { required: false, criteria: [] },
          }),
          analysisStep("decide", {
            evidence_needed: [],
            verification: { required: false, criteria: [] },
          }),
        ],
      },
      {
        candidate_id: "evidence-led",
        completion_test: ["Decision is explicitly verified."],
        plan_steps: [analysisStep("verify-and-decide")],
      },
    ],
  });

  assert.equal(result.status, "PLAN_VALIDATED");
  assert.equal(result.plan_competition.mode, "DETERMINISTIC_COMPETITION");
  assert.equal(result.plan_competition.candidate_count, 2);
  assert.equal(result.plan_competition.valid_candidate_count, 2);
  assert.equal(result.plan_competition.selected_candidate_id, "evidence-led");
  assert.equal(result.governed_plan.steps.length, 1);
});

test("invalid candidate can never outrank a valid candidate", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Prepare a safe governed action",
    plan_candidates: [
      {
        candidate_id: "unsafe-write",
        plan_steps: [
          {
            id: "write",
            title: "Perform unvalidated write",
            kind: "action_candidate",
            mutates: true,
          },
        ],
      },
      {
        candidate_id: "safe-analysis",
        completion_test: ["Safe next action is identified."],
        plan_steps: [analysisStep("safe-next-action")],
      },
    ],
  });

  assert.equal(result.status, "PLAN_VALIDATED");
  assert.equal(result.plan_competition.valid_candidate_count, 1);
  assert.equal(result.plan_competition.selected_candidate_id, "safe-analysis");
});

test("all invalid candidates fail closed", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Attempt governed mutation planning",
    plan_candidates: [
      {
        candidate_id: "invalid-a",
        plan_steps: [{ id: "a", kind: "action_candidate", mutates: true }],
      },
      {
        candidate_id: "invalid-b",
        plan_steps: [{ id: "b", kind: "action_candidate", mutates: true }],
      },
    ],
  });

  assert.equal(result.status, "PLAN_REJECTED_INVALID_GRAPH");
  assert.equal(result.planning_complete, false);
  assert.equal(result.execution_guidance_allowed, false);
  assert.equal(result.plan_competition.valid_candidate_count, 0);
});

test("equal scores use stable candidate order", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Resolve a deterministic tie",
    plan_candidates: [
      { candidate_id: "first", plan_steps: [analysisStep("same")] },
      { candidate_id: "second", plan_steps: [analysisStep("same")] },
    ],
  });

  assert.equal(result.plan_competition.selected_candidate_id, "first");
  assert.equal(result.plan_competition.selected_candidate_index, 0);
});
