import test from "node:test";
import assert from "node:assert/strict";

import { creativeAssetEligibleForMaster } from "../lib/creative/post-production/runtime/CreativePostProductionRuntime.js";
import { buildDepartmentBreakdown } from "../lib/creative/production-room/runtime/CreativeDepartmentBreakdownRuntime.js";

function governedAsset(overrides = {}) {
  return {
    type: "VIDEO",
    status: "GENERATED",
    metadata: {
      requirements: {
        production_room_pipeline: { contract: "CREATIVE_PRODUCTION_ROOM_PIPELINE_V1" },
      },
      ...overrides,
    },
  };
}

test("production-room asset cannot enter post before dailies", () => {
  assert.equal(creativeAssetEligibleForMaster(governedAsset()), false);
});

test("failed dailies asset remains excluded", () => {
  assert.equal(creativeAssetEligibleForMaster(governedAsset({
    dailies_contract: "CREATIVE_DAILIES_ROOM_V1",
    dailies_approved: false,
    dailies_report: { passed: false },
  })), false);
});
test("approved dailies asset becomes eligible for post", () => {
  assert.equal(creativeAssetEligibleForMaster(governedAsset({
    dailies_contract: "CREATIVE_DAILIES_ROOM_V1",
    dailies_approved: true,
    dailies_report: { passed: true },
  })), true);
});

test("legacy source asset is not forced through production-room dailies", () => {
  assert.equal(creativeAssetEligibleForMaster({
    type: "VIDEO",
    status: "IMPORTED",
    metadata: { include_in_master: true },
  }), true);
});

test("department breakdown creates specialist production units and bounded take strategy", () => {
  const report = buildDepartmentBreakdown({
    shots: [{
      id: "shot-a",
      purpose: "Track one helicopter approach while preserving the same platform geography.",
      action: "helicopter flight approach over sea",
      shot_scale: "detail insert",
      continuity_invariants: ["same helicopter", "same platform"],
      subject_identity_key: "heli-a",
      world_identity_key: "rig-a",
      vfx: { integration: ["plate extension"] },
    }],
    take_strategy: {
      max_takes_per_shot: 3,
      variant_budget_rule: "Only create a variant when it gives the editor a materially different usable option.",
    },
    role_decisions: {
      film_director: { status: "ACTIVE" },
      director_of_photography: { status: "ACTIVE" },
      second_unit_director: { status: "ACTIVE" },
    },
  });
  assert.equal(report.passed, true);
  assert.deepEqual(report.units.map((item) => item.unit_id).sort(),
    ["AERIAL_UNIT", "INSERT_UNIT", "PRIMARY_UNIT", "SECOND_UNIT", "VFX_PLATE_UNIT"].sort());
  assert.equal(report.take_strategy.max_takes_per_shot, 3);
});

test("department breakdown rejects unlimited take plans", () => {
  const report = buildDepartmentBreakdown({
    shots: [{ id: "shot-b", purpose: "Hold the real human action until the consequence completes.", continuity_invariants: ["same person"] }],
    take_strategy: { max_takes_per_shot: 20 },
  });
  assert.equal(report.passed, false);
  assert.ok(report.failures.includes("DEPARTMENT_BREAKDOWN_TAKE_LIMIT_REQUIRED"));
});

import { bindTaskTakeExecutionIntent } from "../lib/creative/production-room/runtime/CreativeProductionUnitExecutionRuntime.js";
import { createProductionRoomPlan } from "../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js";
import { buildProductionGraph } from "../lib/creative/production-graph/planner/ProductionGraphPlanner.js";

test("take selection binds only a planned take after virtual rehearsal", () => {
  const task = {
    shot_id: "shot-a",
    input: { requirements: {
      planned_take_menu: {
        contract: "CREATIVE_PLANNED_TAKE_MENU_V1",
        shot_id: "shot-a",
        unit_ids: ["PRIMARY_UNIT", "AERIAL_UNIT"],
        continuity_keys: ["same helicopter", "same platform"],
        max_takes_per_shot: 3,
        planned_take_ids: ["take:shot-a:1", "take:shot-a:2", "take:shot-a:3"],
      },
      production_room_entry_gate: { passed: true, rehearsal_digest: "rehearsal-digest-a" },
    } },
  };
  const bound = bindTaskTakeExecutionIntent({
    task,
    take_index: 2,
    editorial_objective: "Give the editor a later approach phase with the same geography and continuous aircraft motion.",
  });
  assert.equal(bound.input.requirements.take_execution_intent.passed, true);
  assert.equal(bound.input.requirements.take_execution_intent.take_id, "take:shot-a:2");
});

test("production graph materializes unit ownership and planned takes", () => {
  const roomPipeline = createProductionRoomPlan({ project_id: "project-a", master_plan_digest: "master-a" });
  const gatedRoomPipeline = {
    ...roomPipeline,
    stages: roomPipeline.stages.map((stage) => {
      if (stage.id === "VIRTUAL_REHEARSAL") return { ...stage, status: "SEALED", sealed_digest: "rehearsal-digest-a" };
      if (stage.id === "PRODUCTION_UNITS") return { ...stage, status: "READY" };
      return stage;
    }),
  };
  const breakdown = buildDepartmentBreakdown({
    shots: [{
      id: "shot-a",
      purpose: "Track the same helicopter toward the same offshore platform and preserve the editorial approach geography.",
      action: "helicopter flight approach over open sea",
      continuity_invariants: ["same helicopter", "same platform"],
      subject_identity_key: "heli-a",
      world_identity_key: "rig-a",
    }],
    take_strategy: { max_takes_per_shot: 2, variant_budget_rule: "Only materially different editorial options." },
    role_decisions: { film_director: { status: "ACTIVE" }, second_unit_director: { status: "ACTIVE" } },
  });
  const graph = buildProductionGraph({
    organization_id: "org-a",
    creative_project_id: "project-a",
    storyboard: { id: "storyboard-a", title: "Test storyboard" },
    scenes: [{ id: "scene-a", title: "North Sea Approach", objective: "Establish a coherent offshore approach before the worker transfers from aircraft to platform.", duration_seconds: 4 }],
    shots: [{
      id: "shot-a", scene_id: "scene-a", title: "Approach", purpose: "Track the same helicopter toward the same offshore platform and preserve the editorial approach geography.",
      subject: "Heavy offshore helicopter", action: "helicopter flight approach over open sea", duration_seconds: 4,
      continuity_invariants: ["same helicopter", "same platform"], generation: { required: false },
    }],
    creative_plan: {
      workflow_kind: "TEMPORAL",
      story_lineage: { story_contract_hash: "story-a", master_plan_hash: "master-a" },
      production_room_pipeline: gatedRoomPipeline,
      production_room_bootstrap: { stage_inputs: { DEPARTMENT_BREAKDOWN: { report: breakdown } } },
    },
  });
  assert.ok(graph.nodes.some((node) => node.type === "UNIT" && node.metadata?.unit_id === "PRIMARY_UNIT"));
  assert.equal(graph.nodes.filter((node) => node.type === "TAKE").length, 2);
  assert.ok(graph.edges.some((edge) => edge.from.includes("PRIMARY_UNIT") && edge.to === "shot-a"));
  const shotNode = graph.nodes.find((node) => node.id === "shot-a");
  assert.equal(shotNode.requirements?.cinematic_dna?.contract, "CREATIVE_SHOT_CINEMATIC_DNA_V1");
  assert.equal(shotNode.requirements?.cinematic_dna?.visual_quality_floor, 94);
  assert.equal(shotNode.requirements?.cinematic_dna_gate?.passed, true);
});
