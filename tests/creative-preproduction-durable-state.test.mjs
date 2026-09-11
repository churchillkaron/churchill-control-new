import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  readPreproductionDurableState,
} from "../lib/creative/production-room/runtime/CreativePreproductionDurableStateRuntime.js";

const scope = {
  organization_id: "org-a",
  creative_mission_id: "mission-a",
  creative_project_id: "project-a",
};

function project(state) {
  return { id: "project-a", organization_id: "org-a", metadata: { creative_preproduction_state: state } };
}

test("durable preproduction state is scope and master-digest bound", () => {
  const state = {
    contract: "CREATIVE_PREPRODUCTION_DURABLE_STATE_V1",
    ...scope,
    master_plan_digest: "master-a",
    production_room_pipeline: { contract: "CREATIVE_PRODUCTION_ROOM_PIPELINE_V1" },
  };
  assert.equal(readPreproductionDurableState({ project: project(state), context: scope, master_plan_digest: "master-a" }), state);
  assert.equal(readPreproductionDurableState({ project: project(state), context: scope, master_plan_digest: "master-b" }), null);
});
test("preproduction specialist execution is project-scoped and graph-independent", () => {
  const source = fs.readFileSync(
    new URL("../lib/creative/production-room/runtime/CreativePreproductionSpecialistRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /CREATIVE_PREPRODUCTION_SPECIALIST_RUNTIME_V1/);
  assert.match(source, /readPreproductionDurableState/);
  assert.match(source, /persistPreproductionDurableState/);
  assert.doesNotMatch(source, /ProductionGraphRuntime|buildProductionGraph|createProductionGraph/);
  assert.match(source, /production_graph_required:\s*false/);
});