import test from "node:test";
import assert from "node:assert/strict";

import {
  createProductionRoomPlan,
  sealTrustedUpstreamProductionRoomStage,
} from "../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js";

const upstream = [
  ["RESEARCH_ROOM", { contract: "CREATIVE_RESEARCH_ROOM_ADAPTER_V1", passed: true }],
  ["CREATIVE_FLOOR", { contract: "CREATIVE_FRONT_PRODUCTION_ROOMS_V1", room: "CREATIVE_FLOOR", passed: true }],
  ["CONCEPT_COMPETITION", { contract: "CREATIVE_FRONT_PRODUCTION_ROOMS_V1", room: "CONCEPT_COMPETITION", passed: true }],
  ["TRIBUNAL", { contract: "CREATIVE_DYNAMIC_TRIBUNAL_V1", passed: true, verdict: { passed: true } }],
];

test("trusted upstream handoff advances directly to Technical Scout", () => {
  let plan = createProductionRoomPlan({ project_id: "project-a", master_plan_digest: "master-a" });
  let previous = null;
  for (const [stage_id, report] of upstream) {
    plan = sealTrustedUpstreamProductionRoomStage({ plan, stage_id, report, previous_stage_digest: previous });
    previous = plan.stages.find((stage) => stage.id === stage_id).sealed_digest;
  }
  assert.equal(plan.stages.find((stage) => stage.id === "TRIBUNAL").status, "SEALED");
  assert.equal(plan.stages.find((stage) => stage.id === "TECHNICAL_SCOUT").status, "READY");
});
test("invalid Tribunal handoff fails closed", () => {
  let plan = createProductionRoomPlan({ project_id: "project-b", master_plan_digest: "master-b" });
  let previous = null;
  for (const [stage_id, report] of upstream.slice(0, 3)) {
    plan = sealTrustedUpstreamProductionRoomStage({ plan, stage_id, report, previous_stage_digest: previous });
    previous = plan.stages.find((stage) => stage.id === stage_id).sealed_digest;
  }
  assert.throws(() => sealTrustedUpstreamProductionRoomStage({
    plan,
    stage_id: "TRIBUNAL",
    report: { contract: "CREATIVE_DYNAMIC_TRIBUNAL_V1", passed: false, verdict: { passed: false } },
    previous_stage_digest: previous,
  }), /CREATIVE_TRIBUNAL_REPORT_REQUIRED/);
});

test("trusted handoff cannot bypass downstream room execution", () => {
  const plan = createProductionRoomPlan({ project_id: "project-c", master_plan_digest: "master-c" });
  assert.throws(() => sealTrustedUpstreamProductionRoomStage({
    plan,
    stage_id: "TECHNICAL_SCOUT",
    report: { passed: true },
  }), /CREATIVE_PRODUCTION_ROOM_TRUSTED_HANDOFF_FORBIDDEN:TECHNICAL_SCOUT/);
});