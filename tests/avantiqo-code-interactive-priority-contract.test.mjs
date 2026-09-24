import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const intelligenceQueue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const codeQueue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");
const planner = fs.readFileSync("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8");

test("Code conversation metadata is retained while front and deep cognition keep deterministic priority", () => {
  assert.match(intelligenceQueue, /const LANES = new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(intelligenceQueue, /interactive_code: Boolean/);
  assert.match(intelligenceQueue, /code_studio_interactive_preview === true/);
  assert.match(intelligenceQueue, /local_development_owned_code_preview === true/);
  assert.match(intelligenceQueue, /executionLane === "front"[\s\S]*\? 100/);
  assert.match(intelligenceQueue, /executionLane === "deep"[\s\S]*\? 95 : 50/);
});

test("local Code jobs keep one bounded queue priority while planner improves responsiveness by fast status polling", () => {
  assert.match(codeQueue, /priority:75/);
  assert.match(planner, /fastLocalPlannerJobStatus/);
  assert.match(planner, /isIntelligenceLocalQueueJob/);
  assert.match(planner, /getIntelligenceLocalQueueStatus/);
  assert.doesNotMatch(codeQueue, /Modal|RunPod|runpod/);
});
