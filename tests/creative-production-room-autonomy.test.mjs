import test from "node:test";
import assert from "node:assert/strict";

import { createProductionRoomPlan } from "../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js";
import { decideProductionRoomAutonomy } from "../lib/creative/production-room/runtime/CreativeProductionRoomAutonomyRuntime.js";
import { evaluateVirtualProductionWorkstream } from "../lib/creative/production-room/runtime/CreativeVirtualProductionWorkstreamRuntime.js";

function researchReport() {
  return {
    contract: "CREATIVE_RESEARCH_ROOM_ADAPTER_V1",
    passed: true,
    evidence: {
      source_manifest: [{ source_id: "a" }, { source_id: "b" }],
      open_questions: ["none unresolved"],
    },
  };
}

function report(requirement, evidence) {
  return evaluateVirtualProductionWorkstream({ requirement, evidence });
}
const researchWorkstream = report(1, {
  source_manifest: [{ source_id: "a" }, { source_id: "b" }],
  location_findings: ["specific location truth"],
  cultural_findings: ["specific local behavior"],
  technical_findings: ["specific technical truth"],
  weather_daylight_findings: ["specific daylight constraint"],
  open_questions: ["none unresolved"],
});

const castingWorkstream = report(2, {
  character_bible: ["principal worker continuity identity"],
  casting_specification: ["role-correct age, build and behavior"],
  extras_plan: ["background labor remains operational, never posed"],
  wardrobe_fit_rules: ["weather-responsive role-correct PPE"],
  performance_rehearsal: ["repeatable lived-action beats"],
});
test("autonomy first schedules only the missing ready Research Room specialist", () => {
  const plan = createProductionRoomPlan({ project_id: "project-a", master_plan_digest: "master-a" });
  const decision = decideProductionRoomAutonomy({
    production_room_pipeline: plan,
    production_room_stage_inputs: {
      RESEARCH_ROOM: { research_room_report: researchReport() },
    },
    reports_by_stage: {
      RESEARCH_ROOM: [researchWorkstream],
    },
  });
  assert.equal(decision.action, "EXECUTE_SPECIALIST_WAVE");
  assert.equal(decision.stage_id, "RESEARCH_ROOM");
  assert.equal(decision.work_orders.ready_count, 1);
  assert.equal(decision.work_orders.work_orders[0].requirement, 2);
  assert.equal(decision.zero_media_generation, true);
});
test("autonomy seals Research Room only after all workstreams and authoritative room evidence exist", () => {
  const plan = createProductionRoomPlan({ project_id: "project-a", master_plan_digest: "master-a" });
  const decision = decideProductionRoomAutonomy({
    production_room_pipeline: plan,
    production_room_stage_inputs: {
      RESEARCH_ROOM: { research_room_report: researchReport() },
    },
    reports_by_stage: {
      RESEARCH_ROOM: [researchWorkstream, castingWorkstream],
    },
  });
  assert.equal(decision.action, "SEAL_CURRENT_ROOM");
  assert.equal(decision.stage_id, "RESEARCH_ROOM");
  assert.equal(decision.preview.sealed_stage.status, "SEALED");
  assert.equal(decision.preview.next_stage.id, "CREATIVE_FLOOR");
  assert.equal(decision.preview.next_stage.status, "READY");
});

test("autonomy refuses to seal complete workstreams when authoritative room evidence is missing", () => {
  const plan = createProductionRoomPlan({ project_id: "project-a", master_plan_digest: "master-a" });
  const decision = decideProductionRoomAutonomy({
    production_room_pipeline: plan,
    production_room_stage_inputs: {},
    reports_by_stage: {
      RESEARCH_ROOM: [researchWorkstream, castingWorkstream],
    },
  });
  assert.equal(decision.action, "BLOCKED_ROOM_EVIDENCE");
  assert.match(decision.blocker, /CREATIVE_PRODUCTION_ROOM_EVIDENCE_REQUIRED|CREATIVE_RESEARCH_ROOM_REPORT_REQUIRED/);
});
