import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync(
  new URL("../services/avantiqo-intelligence-modal/modal_app.py", import.meta.url),
  "utf8",
);
const reasoning = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url),
  "utf8",
);

test("malformed Modal tool JSON becomes a bounded synthetic blocked call", () => {
  assert.match(worker, /except json\.JSONDecodeError:/);
  assert.match(worker, /"name": "__avantiqo_invalid_tool_call__"/);
  assert.match(worker, /"code": "AVANTIQO_INTELLIGENCE_MODAL_TOOL_CALL_JSON_INVALID"/);
  assert.doesNotMatch(worker, /raise RuntimeError\("AVANTIQO_INTELLIGENCE_MODAL_TOOL_CALL_JSON_INVALID"\)/);
});

test("reasoning intercepts malformed-call markers before registry execution", () => {
  assert.match(reasoning, /toolName === "__avantiqo_invalid_tool_call__"/);
  assert.match(reasoning, /retry_allowed: true/);
  assert.match(reasoning, /authorization_effect: "NONE"/);
  assert.match(reasoning, /conversation\.push\(toolResultMessage\(call, invalidToolCall\)\)/);
  assert.match(reasoning, /totalToolCalls \+= 1/);
});
