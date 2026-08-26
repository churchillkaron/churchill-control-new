import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  compileOwnedCognitivePlan,
  OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
} from "../lib/operator/runtime/OperatorOwnedCognitivePlanRuntime.js";

function readStep(overrides = {}) {
  return {
    id: "read-current-state",
    title: "Read current state",
    kind: "read",
    depends_on: [],
    mutates: false,
    verification: {
      required: true,
      criteria: ["Current scoped evidence was returned."],
    },
    ...overrides,
  };
}

test("cognitive plan compiler accepts a valid governed plan graph", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Inspect the current state and verify it",
    completion_test: "Current evidence has been verified.",
    plan_steps: [readStep()],
  });

  assert.equal(result.contract, OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT);
  assert.equal(result.status, "PLAN_VALIDATED");
  assert.equal(result.planning_complete, true);
  assert.equal(result.execution_guidance_allowed, true);
  assert.equal(result.governed_plan.valid, true);
  assert.deepEqual(result.governed_plan.execution_order, ["read-current-state"]);
  assert.equal(result.governance.execution_authority, "NONE");
});

test("cognitive plan compiler rejects a missing materialized plan", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Do something complex",
    plan_steps: [],
  });

  assert.equal(result.status, "PLAN_NOT_MATERIALIZED");
  assert.equal(result.planning_complete, false);
  assert.equal(result.execution_guidance_allowed, false);
  assert.equal(result.governed_plan, null);
  assert.ok(result.issues.some((issue) => issue.code === "COGNITIVE_PLAN_STEPS_REQUIRED"));
});

test("cognitive plan compiler rejects invalid dependencies", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Reject a malformed graph",
    plan_steps: [
      readStep({ id: "a", depends_on: ["b"] }),
      readStep({ id: "b", depends_on: ["a"] }),
    ],
  });

  assert.equal(result.status, "PLAN_REJECTED_INVALID_GRAPH");
  assert.equal(result.planning_complete, false);
  assert.equal(result.execution_guidance_allowed, false);
  assert.equal(result.governed_plan.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "PLAN_DEPENDENCY_CYCLE"));
});

test("cognitive plan compiler rejects unsafe mutation planning", () => {
  const result = compileOwnedCognitivePlan({
    goal: "Attempt a mutation without governance",
    plan_steps: [
      {
        id: "unsafe-change",
        title: "Unsafe change",
        kind: "action_candidate",
        depends_on: [],
        mutates: true,
        verification: { required: false, criteria: [] },
      },
    ],
  });

  assert.equal(result.status, "PLAN_REJECTED_INVALID_GRAPH");
  assert.equal(result.execution_guidance_allowed, false);
  const codes = result.issues.map((issue) => issue.code);
  assert.ok(codes.includes("MUTATION_CAPABILITY_KEY_REQUIRED"));
  assert.ok(codes.includes("MUTATION_ACTION_CANDIDATE_VALIDATION_REQUIRED"));
  assert.ok(codes.includes("MUTATION_COMPLETION_VERIFICATION_REQUIRED"));
});

test("Synthetic Intelligence V4 compiles model plan steps before Operator handoff", () => {
  const source = fs.readFileSync(
    new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /AVANTIQO_OPERATOR_OWNED_COGNITIVE_BRIEF_V4/);
  assert.match(source, /OperatorOwnedCognitivePlanRuntime\.attach/);
  assert.match(source, /completion_test, plan_steps/);
  assert.match(source, /governed_plan is a deterministic planning graph only/);
  assert.match(source, /execution_guidance_allowed=false/);
  assert.match(source, /cognitive_plan_execution_guidance_allowed/);
  assert.match(source, /execution_governance_bypassed:\s*false/);
});
