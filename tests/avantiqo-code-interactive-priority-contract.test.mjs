import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const intelligenceQueue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const codeQueue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");
const planner = fs.readFileSync("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8");

test("Code runs on a dedicated priority-90 lane instead of competing with intelligence lanes", () => {
  assert.match(codeQueue, /const INTERACTIVE_CODE_PRIORITY=90/);
  assert.match(codeQueue, /lane:"code"/);
  assert.match(codeQueue, /priority:INTERACTIVE_CODE_PRIORITY/);
  assert.match(intelligenceQueue, /const LANES = new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(intelligenceQueue, /executionLane === "front"[\s\S]*\? 100/);
  assert.match(intelligenceQueue, /executionLane === "deep" && text\(input\.capability\) === "ai\.reasoning\.execute" \? 95 : 50/);
});

test("planner still marks interactive Code intent while dedicated Code scheduling stays authoritative", () => {
  assert.match(planner, /interactive_code: true/);
  assert.match(planner, /origin_module: "CODE_AI_PLANNER"/);
  assert.doesNotMatch(codeQueue, /interactive\?INTERACTIVE_CODE_PRIORITY:75/);
});
