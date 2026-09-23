import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js",
  "utf8",
);

test("local live conversation runtime declares and queues the installed 1.7B model", () => {
  assert.match(runtime, /const LIVE_CONVERSATION_RUNTIME_MODEL = "qwen3:1\.7b"/);
  assert.match(runtime, /taskMode === "code_live_conversation"\) return LIVE_CONVERSATION_RUNTIME_MODEL/);
  assert.match(runtime, /model: runtimeModelForInput\(input, executionLane\)/);
  assert.doesNotMatch(runtime, /model: RUNTIME_MODEL,\s*\n\s*payload: payload\(input, executionLane\)/);
});

test("deep and default local intelligence remain on the owned 4B runtime", () => {
  assert.match(runtime, /const RUNTIME_MODEL = "qwen3:4b-instruct"/);
  assert.match(runtime, /taskMode === "code_deep_conversation"\) return RUNTIME_MODEL/);
  assert.match(runtime, /return RUNTIME_MODEL/);
});
