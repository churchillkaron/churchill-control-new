import test from "node:test";
import assert from "node:assert/strict";

import { createProductionWorkOrder } from "../lib/creative/production-room/runtime/CreativeProductionWorkOrderRuntime.js";
import {
  planSpecialistExecutionWave,
  executeSpecialistExecutionWave,
} from "../lib/creative/production-room/runtime/CreativeProductionSpecialistSchedulerRuntime.js";

function order(requirement, completed = []) {
  return createProductionWorkOrder({
    stage_id: "PREVIS",
    requirement,
    completed_requirements: completed,
  });
}

const evidence = {
  7: {
    master_action_state: ["same action state"], camera_units: ["hero", "insert"],
    shared_continuity: ["same identity"], coverage_purposes: ["hero", "detail"],
    cut_opportunities: ["action end"],
  },
  12: {
    editorial_precheck: ["cut logic checked"], assembly_logic: ["causal assembly"],
    coverage_gaps: ["none unresolved"], transition_logic: ["motion handoff"],
    time_compression_plan: ["compress travel only"], insert_needs: ["mechanical detail"],
  },
};
test("scheduler excludes blocked work and caps the parallel wave", () => {
  const orders = [
    order(7, [4, 6]),
    order(12, [1]),
    order(5, [1]),
    order(6, [1, 4]),
  ];
  const plan = planSpecialistExecutionWave({ work_orders: orders, max_concurrency: 2 });
  assert.equal(plan.wave.length, 2);
  assert.equal(plan.deferred.length, 0);
  assert.equal(plan.blocked.length, 2);
  assert.equal(plan.media_generation_authority, false);
});

test("scheduler preserves successful specialists while routing weak evidence to repair", async () => {
  const orders = [order(7, [4, 6]), order(12, [1])];
  const fake = {
    async execute(input) {
      const requirement = Number(String(input.metadata.operation).split("_").at(-1));
      return { output: requirement === 7 ? evidence[7] : {} , provider: "avantiqo-intelligence" };
    },
  };
  const result = await executeSpecialistExecutionWave({
    organization_id: "org-a", creative_project_id: "project-a",
    work_orders: orders, max_concurrency: 2, execution_runtime: fake,
  });
  assert.equal(result.wave_size, 2);
  assert.equal(result.passed_count, 1);
  assert.equal(result.repair_count, 1);
  assert.equal(result.failed_count, 0);
  assert.equal(result.passed, false);
  assert.equal(result.media_generation_executed, false);
});
