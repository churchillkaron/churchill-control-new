import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const local = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js",
  "utf8",
);
const reasoning = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js",
  "utf8",
);

test("local provider normalizes tool arguments without granting authority", () => {
  assert.match(local, /function normalizeToolCalls\(value\)/);
  assert.match(local, /JSON\.stringify\(fn\.arguments\)/);
  assert.match(local, /text\(fn\.arguments\) \|\| "\{\}"/);
  assert.match(local, /mutation_authority: false/);
});

test("reasoning blocks malformed tool arguments before registry execution", () => {
  assert.match(reasoning, /AVANTIQO_INTELLIGENCE_TOOL_ARGUMENTS_INVALID_JSON/);
  assert.match(reasoning, /blocked: true/);
  assert.match(reasoning, /authorization_effect: "NONE"/);
  assert.match(reasoning, /conversation\.push\(toolResultMessage\(call, invalidArguments\)\)/);
});

test("legacy synthetic invalid-call markers remain bounded and non-authorizing if encountered", () => {
  assert.match(reasoning, /toolName === "__avantiqo_invalid_tool_call__"/);
  assert.match(reasoning, /AVANTIQO_INTELLIGENCE_TOOL_CALL_JSON_INVALID/);
  assert.match(reasoning, /retry_allowed: true/);
  assert.match(reasoning, /authorization_effect: "NONE"/);
});
