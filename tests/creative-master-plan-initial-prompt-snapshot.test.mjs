import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeMasterPlanRuntime.js", import.meta.url),
  "utf8",
);

test("initial master-plan reasoning compacts durable project and brief state", () => {
  const start = source.indexOf("function decisionRequest");
  const end = source.indexOf("function operativeWorkflowInstructions", start);
  const block = source.slice(start, end);
  assert.match(block, /mission: creativeMissionPromptSnapshot\(mission\)/);
  assert.match(block, /project: creativeProjectPromptSnapshot\(project\)/);
  assert.match(block, /brief: creativeBriefPromptSnapshot\(brief\)/);
  assert.doesNotMatch(block, /context:\s*\{\s*mission,\s*project,\s*brief,/s);
});
