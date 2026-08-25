import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const runtime = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url),
  "utf8",
);
const registry = fs.readFileSync(
  new URL("../lib/intelligence/runtime/IntelligenceToolRegistry.js", import.meta.url),
  "utf8",
);

test("reasoning loop is pinned to owned Intelligence through Service Runtime", () => {
  assert.match(runtime, /ServiceExecutionRuntime\.execute/);
  assert.match(runtime, /provider_id:\s*OWNED_PROVIDER/);
  assert.match(runtime, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
  assert.match(runtime, /const OWNED_PROVIDER = "avantiqo-intelligence"/);
});

test("owned Intelligence review pricing is development-only and production stays fail-closed", () => {
  assert.match(runtime, /const LOCAL_REVIEW_SCOPE = "BENCHMARK_REVIEW_PREVIEW"/);
  assert.match(runtime, /function localDevelopmentOwnedReviewPolicy\(\)/);
  assert.match(runtime, /process\.env\.NODE_ENV/);
  assert.match(runtime, /toLowerCase\(\) !== "development"\) return \{\}/);
  assert.match(runtime, /execution_scope:\s*LOCAL_REVIEW_SCOPE/);
  assert.match(runtime, /benchmark_only:\s*true/);
  assert.match(runtime, /owned_only_required:\s*true/);
  assert.match(runtime, /external_fallback_allowed:\s*false/);
  assert.match(runtime, /production_certified:\s*false/);
  assert.match(runtime, /\.\.\.localReviewPolicy/);
});

test("reasoning loop is bounded and rejects tool replay", () => {
  assert.match(runtime, /MAX_TURNS = 20/);
  assert.match(runtime, /MAX_TOOL_CALLS = 64/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_TOOL_CALL_LIMIT_EXCEEDED/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_REASONING_TURN_LIMIT_EXCEEDED/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED/);
});

test("reasoning loop requires organization scope and feeds tool results back", () => {
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_ORGANIZATION_SCOPE_REQUIRED/);
  assert.match(runtime, /role:\s*"tool"/);
  assert.match(runtime, /tool_call_id:/);
  assert.match(runtime, /conversation\.push\(assistantToolCallMessage\(calls\)\)/);
});

test("tool registry fails closed for unknown and unauthorized mutations", () => {
  assert.match(registry, /AVANTIQO_INTELLIGENCE_UNKNOWN_TOOL/);
  assert.match(registry, /AVANTIQO_INTELLIGENCE_MUTATING_TOOL_AUTHORIZATION_REQUIRED/);
  assert.match(registry, /AVANTIQO_INTELLIGENCE_TOOL_APPROVAL_REQUIRED/);
  assert.match(registry, /definition\.mutates === true/);
});

test("tool registry exposes only explicit function descriptors", () => {
  assert.match(registry, /type:\s*"function"/);
  assert.match(registry, /TOOL_NAME_PATTERN/);
  assert.match(registry, /AVANTIQO_INTELLIGENCE_TOOL_EXECUTOR_REQUIRED/);
  assert.doesNotMatch(registry, /eval\s*\(/);
  assert.doesNotMatch(registry, /new Function\s*\(/);
});
