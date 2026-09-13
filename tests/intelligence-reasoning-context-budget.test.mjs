import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url), "utf8");

test("shared Intelligence reasoning has fixed Fast and Deep context ceilings", () => {
  assert.match(runtime, /REASONING_CONTEXT_POLICY/);
  assert.match(runtime, /fast: Object\.freeze\(\{ message_count: 10, message_chars: 12000/);
  assert.match(runtime, /deep: Object\.freeze\(\{ message_count: 20, message_chars: 30000/);
  assert.match(runtime, /boundedInitialReasoningMessages/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_REASONING_CONTEXT_BUDGET_V1/);
});

test("tool evidence is capped by lane even when a tool asks for a larger result", () => {
  assert.match(runtime, /tool_result_chars: 8000/);
  assert.match(runtime, /tool_result_chars: 18000/);
  assert.match(runtime, /Math\.min\(toolResultCeiling, requestedResultChars\)/);
  assert.match(runtime, /context_budget: contextBudgetTelemetry/);
});
