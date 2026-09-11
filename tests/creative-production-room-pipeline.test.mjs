import test from "node:test";
import assert from "node:assert/strict";

import {
  CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS,
  CREATIVE_VIRTUAL_SPECIALISTS,
} from "../lib/creative/production-room/registry/CreativeVirtualProductionSpecialistRegistry.js";
import {
  CREATIVE_PRODUCTION_ROOM_STAGES,
} from "../lib/creative/production-room/registry/CreativeProductionRoomStageRegistry.js";
import {
  createProductionRoomPlan,
  sealProductionRoomStage,
  productionEntryGate,
} from "../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js";

function evidenceFor(stage) {
  const evidence = Object.fromEntries(stage.required_evidence.map((key) => [key, `${stage.id}:${key}:verified`]));
  evidence.workstream_reports = stage.required_workstream_requirements.map((requirement) => ({
    contract: "CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_V1",
    requirement,
    passed: true,
  }));
  if (stage.id === "RESEARCH_ROOM") {
    evidence.room_report = { contract: "CREATIVE_RESEARCH_ROOM_ADAPTER_V1", passed: true };
  }
  if (["CREATIVE_FLOOR", "CONCEPT_COMPETITION"].includes(stage.id)) {
    evidence.room_report = { contract: "CREATIVE_FRONT_PRODUCTION_ROOMS_V1", room: stage.id, passed: true };
  }
  if (stage.id === "TRIBUNAL") {
    evidence.room_report = { contract: "CREATIVE_DYNAMIC_TRIBUNAL_V1", passed: true, verdict: { passed: true } };
  }
  if (stage.id === "TECHNICAL_SCOUT") {
    evidence.room_report = { contract: "CREATIVE_TECHNICAL_SCOUT_V1", passed: true, zero_provider_calls: true, zero_media_generation: true };
  }
  if (stage.id === "DEPARTMENT_BREAKDOWN") {
    evidence.room_report = { contract: "CREATIVE_DEPARTMENT_BREAKDOWN_V1", passed: true, zero_provider_calls: true, zero_media_generation: true };
  }
  if (stage.id === "VIRTUAL_REHEARSAL") {
    evidence.room_report = { contract: "CREATIVE_VIRTUAL_REHEARSAL_V1", passed: true, zero_provider_calls: true, zero_media_generation: true };
  }
  return evidence;
}

test("all twenty production workstreams exist with accountable owners and specialists", () => {
  assert.equal(CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.length, 20);
  assert.deepEqual(CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.map((item) => item.requirement),
    Array.from({ length: 20 }, (_, index) => index + 1));
  assert.ok(CREATIVE_VIRTUAL_SPECIALISTS.length >= 100);
  for (const workstream of CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS) {
    assert.ok(workstream.owner);
    assert.ok(workstream.specialists.length >= 5);
  }
});
test("seventeen production rooms are ordered from research to release", () => {
  assert.equal(CREATIVE_PRODUCTION_ROOM_STAGES.length, 17);
  assert.equal(CREATIVE_PRODUCTION_ROOM_STAGES[0].id, "RESEARCH_ROOM");
  assert.equal(CREATIVE_PRODUCTION_ROOM_STAGES.at(-1).id, "RELEASE");
  assert.deepEqual(
    CREATIVE_PRODUCTION_ROOM_STAGES.map((stage) => stage.order),
    Array.from({ length: 17 }, (_, index) => index + 1),
  );
});

test("stage skipping is impossible", () => {
  const plan = createProductionRoomPlan({ project_id: "project-a", master_plan_digest: "master-a" });
  const creativeFloor = plan.stages.find((stage) => stage.id === "CREATIVE_FLOOR");
  assert.throws(
    () => sealProductionRoomStage({
      plan,
      stage_id: "CREATIVE_FLOOR",
      evidence: evidenceFor(creativeFloor),
      previous_stage_digest: null,
    }),
    /CREATIVE_PRODUCTION_ROOM_STAGE_ORDER_VIOLATION/,
  );
});
test("missing stage evidence fails closed", () => {
  const plan = createProductionRoomPlan({ project_id: "project-b", master_plan_digest: "master-b" });
  assert.throws(
    () => sealProductionRoomStage({ plan, stage_id: "RESEARCH_ROOM", evidence: {} }),
    /CREATIVE_PRODUCTION_ROOM_EVIDENCE_REQUIRED:RESEARCH_ROOM/,
  );
});

test("production remains blocked until virtual rehearsal is sealed", () => {
  let plan = createProductionRoomPlan({ project_id: "project-c", master_plan_digest: "master-c" });
  assert.equal(productionEntryGate(plan).passed, false);
  let previous = null;
  for (const stage of plan.stages.filter((item) => item.order <= 8)) {
    plan = sealProductionRoomStage({
      plan,
      stage_id: stage.id,
      evidence: evidenceFor(stage),
      previous_stage_digest: previous,
    });
    previous = plan.stages.find((item) => item.id === stage.id).sealed_digest;
  }
  const gate = productionEntryGate(plan);
  assert.equal(gate.passed, true);
  assert.equal(gate.required_stage, "VIRTUAL_REHEARSAL");
  assert.equal(gate.next_stage, "PRODUCTION_UNITS");
  assert.match(gate.rehearsal_digest, /^[a-f0-9]{64}$/);
});
test("a room cannot seal when one applicable workstream report is missing", () => {
  const plan = createProductionRoomPlan({ project_id: "project-d", master_plan_digest: "master-d" });
  const research = plan.stages.find((stage) => stage.id === "RESEARCH_ROOM");
  const evidence = evidenceFor(research);
  evidence.workstream_reports = evidence.workstream_reports.slice(1);
  assert.throws(
    () => sealProductionRoomStage({ plan, stage_id: research.id, evidence }),
    /CREATIVE_PRODUCTION_ROOM_WORKSTREAM_REPORT_REQUIRED:RESEARCH_ROOM/,
  );
});