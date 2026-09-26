import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const director = fs.readFileSync("lib/creative/director/runtime/CreativeDirectorRuntime.js", "utf8");
const reasoning = fs.readFileSync("lib/creative/reasoning/CreativeReasoningService.js", "utf8");

test("ID-based temporal resume bypasses generic Creative Partner preflight", () => {
  assert.match(director, /const temporalResume = Boolean/);
  assert.match(director, /requestedWorkflowKind === "TEMPORAL"/);
  assert.match(director, /input\.creative_project_id \|\| input\.project_id/);
  assert.match(director, /input\.creative_mission_id \|\| input\.mission_id/);
  assert.match(director, /if \(temporalResume\) \{\s*return buildRoutedPipeline\(input\);/);
  const temporalBranch = director.indexOf("if (temporalResume)");
  const genericPreflight = director.indexOf("CreativeIntelligenceRuntime.createCreativePlan", temporalBranch);
  assert.ok(temporalBranch >= 0 && genericPreflight > temporalBranch, "temporal bypass must precede generic preflight");
});

test("creative reasoning preserves project mission and workflow identity across every governed phase", () => {
  assert.match(reasoning, /function creativeTraceMetadata\(input = \{\}\)/);
  assert.match(reasoning, /creative_project_id: text\(source\.creative_project_id \|\| source\.project_id\) \|\| null/);
  assert.match(reasoning, /creative_mission_id: text\(source\.creative_mission_id \|\| source\.mission_id\) \|\| null/);
  assert.match(reasoning, /workflow_kind: text\(source\.workflow_kind\) \|\| null/);
  const matches = reasoning.match(/\.\.\.creativeTraceMetadata\(input\)/g) || [];
  assert.ok(matches.length >= 5, `expected trace metadata in owned, repair, fallback, settlement and cancel paths; found ${matches.length}`);
  assert.match(reasoning, /settleGovernedFallbackExecution\(execution, \{ organizationId, task, input = \{\} \}\)/);
  assert.match(reasoning, /organizationId: input\.organization_id,\s*task,\s*input,/);
});
