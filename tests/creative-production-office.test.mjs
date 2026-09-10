import test from "node:test";
import assert from "node:assert/strict";

import { createProductionRoomPlan } from "../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js";
import {
  evaluateProductionOffice,
  advanceProductionOffice,
} from "../lib/creative/production-room/runtime/CreativeProductionOfficeRuntime.js";
import {
  createProductionWorkOrder,
  createCurrentRoomWorkOrders,
  completeProductionWorkOrder,
} from "../lib/creative/production-room/runtime/CreativeProductionWorkOrderRuntime.js";

function report(requirement) {
  return {
    contract: "CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_V1",
    requirement,
    passed: true,
  };
}

function researchEvidence() {
  return {
    research_packet: { validated: true },
    source_manifest: ["source-a", "source-b"],
    open_questions: ["none production-critical"],
    room_report: {
      contract: "CREATIVE_RESEARCH_ROOM_ADAPTER_V1",
      passed: true,
    },
  };
}
test("production office exposes current room blockers and parallel specialist lanes", () => {
  const plan = createProductionRoomPlan({ project_id: "office-a", master_plan_digest: "master-a" });
  const office = evaluateProductionOffice({ plan, reports_by_stage: { RESEARCH_ROOM: [report(1)] } });
  assert.equal(office.current_room.stage_id, "RESEARCH_ROOM");
  assert.deepEqual(office.current_room.completed_workstreams, [1]);
  assert.deepEqual(office.current_room.missing_workstreams, [2]);
  assert.equal(office.parallel_specialist_lane_count, 1);
  assert.match(office.current_room.ready_specialist_lanes[0].workstream_id, /casting/);
});

test("production office refuses incomplete room advancement", () => {
  const plan = createProductionRoomPlan({ project_id: "office-b", master_plan_digest: "master-b" });
  assert.throws(() => advanceProductionOffice({
    plan,
    stage_id: "RESEARCH_ROOM",
    evidence: researchEvidence(),
    workstream_reports: [report(1)],
  }), /WORKSTREAM_REPORT_REQUIRED/);
});
test("production office seals ready room and opens the next room", () => {
  const plan = createProductionRoomPlan({ project_id: "office-c", master_plan_digest: "master-c" });
  const advanced = advanceProductionOffice({
    plan,
    stage_id: "RESEARCH_ROOM",
    evidence: researchEvidence(),
    workstream_reports: [report(1), report(2)],
  });
  assert.equal(advanced.sealed_stage.status, "SEALED");
  assert.equal(advanced.next_stage.id, "CREATIVE_FLOOR");
  assert.equal(advanced.next_stage.status, "READY");
  assert.match(advanced.sealed_stage.sealed_digest, /^[a-f0-9]{64}$/);
});

test("production office refuses advancing a blocked room", () => {
  const plan = createProductionRoomPlan({ project_id: "office-d", master_plan_digest: "master-d" });
  assert.throws(() => advanceProductionOffice({
    plan,
    stage_id: "CREATIVE_FLOOR",
    evidence: {},
    workstream_reports: [],
  }), /STAGE_NOT_READY/);
});
test("work orders expose dependencies and never grant provider authority", () => {
  const blocked = createProductionWorkOrder({
    stage_id: "PREVIS",
    requirement: 7,
    completed_requirements: [4],
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.deepEqual(blocked.blocked_by, [6]);
  assert.equal(blocked.provider_execution_authority, false);
  assert.equal(blocked.media_generation_authority, false);

  const ready = createProductionWorkOrder({
    stage_id: "PREVIS",
    requirement: 7,
    completed_requirements: [4, 6],
  });
  assert.equal(ready.status, "READY");
  assert.ok(ready.required_outputs.includes("camera_units"));
});
test("current-room work orders honor completed work from earlier rooms", () => {
  const initial = createProductionRoomPlan({ project_id: "office-e", master_plan_digest: "master-e" });
  const advanced = advanceProductionOffice({
    plan: initial,
    stage_id: "RESEARCH_ROOM",
    evidence: researchEvidence(),
    workstream_reports: [report(1), report(2)],
  });
  const reportsByStage = { RESEARCH_ROOM: [report(1), report(2)], CREATIVE_FLOOR: [] };
  const office = evaluateProductionOffice({
    plan: advanced.production_room_pipeline,
    reports_by_stage: reportsByStage,
  });
  const orders = createCurrentRoomWorkOrders({ office, reports_by_stage: reportsByStage });
  const sound = orders.work_orders.find((item) => item.requirement === 14);
  assert.equal(sound.status, "READY");
  assert.equal(orders.work_orders.find((item) => item.requirement === 15).status, "BLOCKED");
  assert.equal(orders.work_orders.find((item) => item.requirement === 16).status, "READY");
  assert.equal(orders.work_orders.find((item) => item.requirement === 20).status, "READY");
});
test("work-order completion validates evidence and returns repair routing", () => {
  const order = createProductionWorkOrder({
    stage_id: "PREVIS",
    requirement: 7,
    completed_requirements: [4, 6],
  });
  const weak = completeProductionWorkOrder({ work_order: order, evidence: {} });
  assert.equal(weak.passed, false);
  assert.equal(weak.repair_required, true);
  assert.ok(weak.repair_route.some((item) => item.includes("master_action_state")));

  const strong = completeProductionWorkOrder({
    work_order: order,
    evidence: {
      master_action_state: ["same action start/end state"],
      camera_units: ["hero camera", "insert camera"],
      shared_continuity: ["same subject identity", "same world geometry"],
      coverage_purposes: ["hero geography", "mechanical detail"],
      cut_opportunities: ["action completion", "sound-led handoff"],
    },
  });
  assert.equal(strong.passed, true, strong.repair_route.join(","));
  assert.equal(strong.provider_execution_authority, false);
});
