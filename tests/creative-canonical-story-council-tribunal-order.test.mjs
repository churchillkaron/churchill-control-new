import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const resolver = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);
const council = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url),
  "utf8",
);

test("story master enters Concept Council before durable Tribunal review", () => {
  const flowStart = resolver.indexOf("initialMaster = await CreativeMasterPlanRuntime.create");
  const flowEnd = resolver.indexOf("const resolved = await bootstrapResolvedProductionRooms", flowStart);
  const flow = resolver.slice(flowStart, flowEnd);
  const story = flow.indexOf("CreativeMasterPlanRuntime.create");
  const conceptCouncil = flow.indexOf("CreativeConceptCouncilRuntime.run");
  const tribunal = flow.indexOf("reviewWithDurableResume");
  assert.ok(story >= 0 && conceptCouncil > story && tribunal > conceptCouncil);
  assert.match(flow, /master:\s*tribunalMaster/);
});

test("pre-tribunal council revises story without directing shots", () => {
  assert.match(council, /This is STORY \/ CREATIVE DIRECTION only\. Return zero shots\. Shot direction belongs after Tribunal\./);
  assert.match(council, /const hasDirectedShots = list\(plan\.scenes\)/);
});

test("temporal direction reuses the already-approved council", () => {
  assert.match(council, /input\.approved_master\?\.independent_concept_council/);
  assert.match(council, /if \(approvedCouncil\)/);
});
