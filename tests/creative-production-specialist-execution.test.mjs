import test from "node:test";
import assert from "node:assert/strict";

import { createProductionWorkOrder } from "../lib/creative/production-room/runtime/CreativeProductionWorkOrderRuntime.js";
import { executeProductionSpecialistWorkOrder } from "../lib/creative/production-room/runtime/CreativeProductionSpecialistExecutionRuntime.js";

function readyCoverageOrder() {
  return createProductionWorkOrder({
    stage_id: "PREVIS",
    requirement: 7,
    completed_requirements: [4, 6],
    context_digest: "rehearsal-context-a",
  });
}

function strongEvidence() {
  return {
    master_action_state: ["same action start/end state"],
    camera_units: ["hero camera", "insert camera"],
    shared_continuity: ["same subject identity", "same world geometry"],
    coverage_purposes: ["hero geography", "mechanical detail"],
    cut_opportunities: ["action completion", "sound-led handoff"],
  };
}
test("specialist execution is owned-reasoning-only and returns validated evidence", async () => {
  let captured = null;
  const fakeRuntime = {
    async execute(input) {
      captured = input;
      return {
        output: strongEvidence(),
        provider: "avantiqo-intelligence",
        model: "fixture-owned-model",
        usage: { id: "fixture-usage" },
      };
    },
  };
  const result = await executeProductionSpecialistWorkOrder({
    organization_id: "org-a",
    creative_project_id: "project-a",
    work_order: readyCoverageOrder(),
    production_context: { sealed_truth: "fixture" },
    execution_runtime: fakeRuntime,
  });
  assert.equal(captured.service_id, "ai.reasoning.execute");
  assert.equal(captured.provider_id, "avantiqo-intelligence");
  assert.deepEqual(captured.provider_policy.allowed_providers, ["avantiqo-intelligence"]);
  assert.equal(captured.provider_policy.allow_owned_reasoning_fallback, false);
  assert.equal(captured.metadata.media_generation_allowed, false);
  assert.equal(result.passed, true, result.completion.repair_route.join(","));
  assert.equal(result.media_generation_executed, false);
});
test("specialist weak evidence returns repair routing instead of false completion", async () => {
  const result = await executeProductionSpecialistWorkOrder({
    organization_id: "org-b",
    creative_project_id: "project-b",
    work_order: readyCoverageOrder(),
    execution_runtime: { async execute() { return { output: {} }; } },
  });
  assert.equal(result.passed, false);
  assert.equal(result.completion.repair_required, true);
  assert.ok(result.completion.repair_route.some((item) => item.includes("master_action_state")));
  assert.equal(result.provider_media_execution_authority, false);
});

test("specialist execution refuses blocked work orders before reasoning", async () => {
  let called = false;
  const blocked = createProductionWorkOrder({
    stage_id: "PREVIS",
    requirement: 7,
    completed_requirements: [4],
  });
  await assert.rejects(() => executeProductionSpecialistWorkOrder({
    organization_id: "org-c",
    creative_project_id: "project-c",
    work_order: blocked,
    execution_runtime: { async execute() { called = true; return { output: strongEvidence() }; } },
  }), /WORK_ORDER_NOT_READY/);
  assert.equal(called, false);
});
