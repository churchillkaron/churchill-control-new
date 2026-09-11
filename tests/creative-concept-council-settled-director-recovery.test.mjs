import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url), "utf8");

test("concept council recovers latest settled director output before new inference", () => {
  assert.match(source, /recoverSettledConceptDirector/);
  assert.match(source, /entries\.at\(-1\)/);
  assert.match(source, /UsageRuntime\.get\(entry\.usage_id\)/);
  assert.match(source, /recovered_from_settled_usage: true/);
  const start = source.indexOf("async function generateIndependentConcepts");
  const end = source.indexOf("const strategicResearch", start);
  const block = source.slice(start, end);
  assert.ok(block.indexOf("recoverSettledConceptDirector") < block.indexOf("return reason({"));
});

test("settled director recovery is scoped to current project and mission", () => {
  assert.match(source, /metadata\.creative_project_id/);
  assert.match(source, /metadata\.creative_mission_id/);
  assert.match(source, /directionApprovalOperations: list\(project\.metadata\?\.paid_direction_approval\?\.operations\)/);
});
