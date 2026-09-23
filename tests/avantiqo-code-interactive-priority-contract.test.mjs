import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const intelligenceQueue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const codeQueue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");
const planner = fs.readFileSync("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8");

test("Code Studio interactive previews outrank background deep work without changing front priority", () => {
  assert.match(intelligenceQueue, /const LANES = new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(intelligenceQueue, /code_studio_interactive_preview === true\s*\? 98/);
  assert.match(intelligenceQueue, /local_development_owned_code_preview === true\s*\? 97/);
  assert.match(intelligenceQueue, /text\(input\.metadata\?\.module\)\.startsWith\("CODE_AI"\)/);
  assert.match(intelligenceQueue, /\? 90\s*:\s*50/);
  assert.match(intelligenceQueue, /executionLane === "front"\s*\? 100/);
});

test("interactive Code provider jobs use priority 90 while ordinary Code remains priority 75", () => {
  assert.match(planner, /interactive_code: true/);
  assert.match(planner, /origin_module: "CODE_AI_PLANNER"/);
  assert.match(codeQueue, /const INTERACTIVE_CODE_PRIORITY=90/);
  assert.match(codeQueue, /input\.interactive_code===true/);
  assert.match(codeQueue, /priority:interactive\?INTERACTIVE_CODE_PRIORITY:75/);
  assert.match(codeQueue, /interactive_code:interactive/);
});
