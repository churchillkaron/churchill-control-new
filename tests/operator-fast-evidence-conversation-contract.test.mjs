import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const fast = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url),
  "utf8",
);

test("fast Business Partner can use governed current evidence without mutation authority", () => {
  assert.match(fast, /fastConversationNeedsEvidence/);
  assert.match(fast, /createOperatorIntelligenceReadTools/);
  assert.match(fast, /AvantiqoIntelligenceReasoningRuntime\.run/);
  assert.match(fast, /operation: "FAST_EVIDENCE_CONVERSATION"/);
  assert.match(fast, /execution_lane: "fast"/);
  assert.match(fast, /authorization: \{ allow_mutating_tools: false \}/);
  assert.match(fast, /This lane is read-only/);
  assert.match(fast, /evidenceExecution\.tool_calls_executed/);
  assert.match(fast, /mutation_executed: false/);
});

test("fast evidence policy recognizes current and public fact questions", () => {
  assert.match(fast, /CURRENT_OR_EXTERNAL_FACT_PATTERN/);
  assert.match(fast, /current\|currently\|latest\|today/);
  assert.match(fast, /weather\|news\|market\|competitor/);
  assert.match(fast, /law\|legal\|regulation\|legislation/);
  assert.match(fast, /address\|located\|location\|where is\|who is\|when is/);
  assert.match(fast, /externalResearchRequested\(input\)/);
});
