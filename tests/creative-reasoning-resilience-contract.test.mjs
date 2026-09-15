import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const supervisor = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js", import.meta.url),
  "utf8",
);
const reasoning = fs.readFileSync(
  new URL("../lib/creative/reasoning/CreativeReasoningService.js", import.meta.url),
  "utf8",
);

test("deep structured result survives optional fast critique failure", () => {
  assert.match(supervisor, /try \{\s*critiqueRepair = await reasoningPhase/);
  assert.match(supervisor, /preserved_initial_brief: true/);
  assert.match(supervisor, /optional: true/);
  assert.match(supervisor, /decisionBrief = critiqueRepair\.text/);
});
test("failed critique is not reported as a successful repair", () => {
  assert.match(supervisor, /repaired: Boolean\(critiqueRepair && critiqueRepair\.success !== false\)/);
});

test("creative reasoning validates every returned structured boundary", () => {
  assert.match(reasoning, /function outputMatchesShape/);
  assert.match(reasoning, /assertOutputShape\(owned\.parsed\?\.result \|\| owned\.parsed, outputShape, "owned_supervisor"\)/);
  assert.match(reasoning, /assertOutputShape\(parsed\.result \|\| parsed, outputShape, "governed_fallback"\)/);
  assert.match(reasoning, /assertOutputShape\(local\.result, outputShape, "deterministic_local_fallback"\)/);
});
const modalDirect = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", import.meta.url),
  "utf8",
);

test("completed Modal intelligence calls have a realistic bounded status-read window", () => {
  assert.match(modalDirect, /const STATUS_POLL_TIMEOUT_MS = 1_500/);
  assert.match(modalDirect, /call\.get\(\{ timeoutMs: STATUS_POLL_TIMEOUT_MS \}\)/);
});
test("fast contract compiler may reuse only an already-valid deep JSON brief", () => {
  assert.match(supervisor, /const directParsed = parseJson\(decisionBrief\)/);
  assert.match(supervisor, /if \(!directParsed\) throw compilerError/);
  assert.match(supervisor, /preserved_valid_decision_brief: true/);
  assert.match(supervisor, /compiler_fallback_to_valid_decision_brief: compilerFallbackToDecisionBrief/);
});

test("governed creative fallback settles one exact pending owned job before parsing", () => {
  assert.match(reasoning, /async function settleGovernedFallbackExecution/);
  assert.match(reasoning, /ServiceExecutionRuntime\.settle\(\{/);
  assert.match(reasoning, /provider_job_id: providerJobId/);
  assert.match(reasoning, /usage_id: usageId/);
  assert.match(reasoning, /provider_job_reused: true/);
  assert.match(reasoning, /duplicate_provider_job_submitted: false/);
  assert.match(reasoning, /execution_lane: "deep"/);
  assert.match(reasoning, /resolveIntelligenceSettledOutputEnvelope\(completed\)/);
});

test("timed out creative fallback cancels its exact governed job", () => {
  assert.match(reasoning, /GOVERNED_FALLBACK_SETTLEMENT_DEADLINE_MS = 420_000/);
  assert.match(reasoning, /ServiceExecutionRuntime\.cancelPending\(\{/);
  assert.match(reasoning, /reason: "CREATIVE_REASONING_FALLBACK_PENDING_TIMEOUT"/);
});
