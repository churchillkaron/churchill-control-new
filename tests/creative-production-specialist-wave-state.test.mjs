import test from "node:test";
import assert from "node:assert/strict";

import { createProductionRoomPlan } from "../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js";
import { mergeSpecialistWaveState } from "../lib/creative/production-room/runtime/CreativeProductionSpecialistWaveStateRuntime.js";

function result(requirement, passed, repair = []) {
  return {
    work_order: { stage_id: "RESEARCH_ROOM", requirement },
    status: "fulfilled",
    result: {
      passed,
      provider: "avantiqo-intelligence",
      model: "fixture",
      completion: {
        repair_required: !passed,
        repair_route: repair,
        workstream_report: {
          contract: "CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_V1",
          requirement,
          passed,
          failures: repair,
        },
      },
    },
  };
}
test("wave merge advances only passed specialist reports and preserves repair audit", () => {
  const plan = createProductionRoomPlan({ project_id: "project-a", master_plan_digest: "master-a" });
  const merged = mergeSpecialistWaveState({
    production_room_pipeline: plan,
    reports_by_stage: {},
    wave_result: {
      contract: "CREATIVE_PRODUCTION_SPECIALIST_SCHEDULER_V1",
      results: [
        result(1, true),
        result(2, false, ["CASTING_SPECIFICATION_REQUIRED"]),
        {
          work_order: { stage_id: "RESEARCH_ROOM", requirement: 3 },
          status: "rejected",
          result: null,
          error: "specialist failed",
        },
      ],
    },
  });
  assert.equal(merged.passed_workstream_count, 1);
  assert.equal(merged.repair_workstream_count, 1);
  assert.equal(merged.failed_workstream_count, 1);
  assert.equal(merged.production_office.current_room.completed_workstreams.includes(1), true);
  assert.equal(merged.production_office.current_room.completed_workstreams.includes(2), false);
  assert.equal(merged.specialist_wave_audit.length, 3);
  assert.equal(merged.zero_media_generation, true);
});
