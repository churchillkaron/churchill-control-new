import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const direct = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js", "utf8");

test("front conversation modes stay on owned local compute", () => {
  assert.match(queue, /LANES = new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(queue, /if \(value === "front"\) \{/);
  assert.match(queue, /!\["external_research","provider_tool_required"\]\.includes\(frontTaskMode\)/);
  assert.match(queue, /const FRONT_MODEL = AVANTIQO_INTELLIGENCE_LOCAL_MODEL/);
  assert.match(queue, /const RUNTIME_MODEL = "qwen3:4b-instruct"/);
  assert.doesNotMatch(queue, /Modal|modal/);
});

test("code live conversation may use the bounded local 1.7B runtime while other front work stays local 4B", () => {
  assert.match(queue, /code_live_conversation/);
  assert.match(queue, /LIVE_CONVERSATION_RUNTIME_MODEL/);
  assert.match(queue, /Qwen\/Qwen3-1\.7B-GGUF/);
  assert.match(direct, /if \(lane === "front"\) return true/);
});
