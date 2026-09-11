import test from "node:test";
import assert from "node:assert/strict";
import { createProductionRoomPlan } from "../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js";
import { continuePreproductionWithoutSpend } from "../lib/creative/production-room/runtime/CreativePreproductionContinuationRuntime.js";

function seededPlan() {
  const plan = createProductionRoomPlan({ project_id: "project-a", master_plan_digest: "master-a" });
  return {
    ...plan,
    stages: plan.stages.map((stage) => {
      if (stage.order <= 4) return { ...stage, status: "SEALED", sealed_digest: `digest-${stage.order}` };
      if (stage.id === "TECHNICAL_SCOUT") return { ...stage, status: "READY" };
      return stage;
    }),
  };
}

test("free continuation stops at specialist execution boundary", () => {
  const result = continuePreproductionWithoutSpend({ production_room_pipeline: seededPlan() });
  assert.equal(result.action, "SPECIALIST_EXECUTION_REQUIRED");
  assert.equal(result.stage_id, "TECHNICAL_SCOUT");
  assert.equal(result.provider_calls_executed, 0);
  assert.equal(result.media_generation_executed, false);
});
function report(requirement) {
  return {
    contract: "CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_V1",
    requirement,
    passed: true,
    evidence: {
      material_library: ["steel"], weather_behavior: "stable", cloth_hair_behavior: "stable", fluid_particulate_behavior: "stable", contact_deformation: "stable",
      sun_path: "stable sun path", motivated_light_map: "motivated practical light", shadow_map: "consistent shadows", reflection_map: "consistent reflections", surface_response: "consistent surface response", exposure_continuity: "locked exposure",
      editorial_precheck: "editable", assembly_logic: "causal assembly", coverage_gaps: [], transition_logic: "motivated cuts", time_compression_plan: "none", insert_needs: ["none"],
      master_action_state: "continuous", camera_units: ["A"], shared_continuity: ["same world"], coverage_purposes: ["story"], cut_opportunities: ["action cut"],
      effect_mode_decisions: ["practical"], practical_elements: ["set"], digital_elements: ["none"], hybrid_handoffs: ["none"], plate_requirements: ["none"],
      dependency_graph: { ready: true }, schedule: { ready: true }, cost_risks: ["bounded"], parallel_work: ["none"], approval_dependencies: ["none"], redo_cost_map: { bounded: true },
      action_path: "continuous action", timing_map: "timed", obstacle_clearance: "clear", safety_constraints: ["safe"], coverage_timing: "covered", edit_points: ["cut"],
      camera_package_logic: "camera package", focus_plan: "focus plan", grip_support_plan: "grip plan", lighting_plan: "lighting plan", specialty_rig_plan: "rig plan", dit_color_pipeline: "color pipeline",
      story_time: "continuous", prop_state: "stable", wardrobe_state: "stable", eyeline_screen_direction: "stable", weather_wetness_state: "stable", change_log: ["none"],
    },
  };
}
test("free continuation seals deterministic preproduction and reaches production gate", () => {
  const byStage = {};
  for (const stage of seededPlan().stages.filter((item) => item.order >= 5 && item.order <= 8)) {
    byStage[stage.id] = stage.required_workstream_requirements.map(report);
  }
  const technicalReports = byStage.TECHNICAL_SCOUT;
  const result = continuePreproductionWithoutSpend({
    production_room_pipeline: seededPlan(),
    reports_by_stage: byStage,
    production_room_stage_inputs: {
      TECHNICAL_SCOUT: { report: { contract: "CREATIVE_TECHNICAL_SCOUT_V1", passed: true, zero_provider_calls: true, zero_media_generation: true, shot_reports: [{ geography: "verified geography", technical: "verified technical" }], workstream_reports: technicalReports } },
      PREVIS: { shot_reports: [{ report: { passed: true, shot_id: "shot-a" } }] },
      DEPARTMENT_BREAKDOWN: { report: { contract: "CREATIVE_DEPARTMENT_BREAKDOWN_V1", passed: true, zero_provider_calls: true, zero_media_generation: true, shot_assignments: [{ shot_id: "shot-a" }] } },
      VIRTUAL_REHEARSAL: { editability_proof: "verified editability", report: { contract: "CREATIVE_VIRTUAL_REHEARSAL_V1", passed: true, zero_provider_calls: true, zero_media_generation: true } },
    },
  });
  assert.equal(result.action, "PRODUCTION_READY");
  assert.equal(result.production_entry_gate.passed, true);
  assert.deepEqual(result.advances.map((item) => item.stage_id), ["TECHNICAL_SCOUT", "PREVIS", "DEPARTMENT_BREAKDOWN", "VIRTUAL_REHEARSAL"]);
  assert.equal(result.provider_calls_executed, 0);
});