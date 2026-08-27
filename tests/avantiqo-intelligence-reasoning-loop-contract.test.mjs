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
const provider = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", import.meta.url),
  "utf8",
);
const providerRegistration = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", import.meta.url),
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

test("owned Intelligence resolves its canonical RunPod endpoint without requiring a copied endpoint id", () => {
  assert.match(provider, /const RUNPOD_REST_BASE = "https:\/\/rest\.runpod\.io\/v1"/);
  assert.match(provider, /const CANONICAL_ENDPOINT_NAME = "avantiqo-intelligence-v1"/);
  assert.match(provider, /RUNPOD_MANAGEMENT_API_KEY/);
  assert.match(provider, /process\.env\.RUNPOD_API_KEY/);
  assert.match(provider, /endpoints\?includeTemplate=false&includeWorkers=false/);
  assert.match(provider, /text\(endpoint\?\.name\) === CANONICAL_ENDPOINT_NAME/);
  assert.match(provider, /matches\.length !== 1/);
  assert.match(provider, /RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID/);
  assert.match(provider, /if \(explicit\) return validateEndpointId\(explicit\)/);
  assert.match(provider, /const \{ baseUrl, apiKey \} = await config\(\)/);
  assert.match(provider, /const \{ apiBase, apiKey \} = await config\(\)/);
});

test("provider registration permits only development review bypass and advertises owned-only inference", () => {
  assert.match(providerRegistration, /localReviewRuntimeAllowed/);
  assert.match(providerRegistration, /process\.env\.NODE_ENV/);
  assert.match(providerRegistration, /toLowerCase\(\) === "development"/);
  assert.match(providerRegistration, /runpodEndpointId \|\| runpodManagementKey/);
  assert.match(providerRegistration, /engineEnabled \|\| localReviewRuntimeAllowed/);
  assert.match(providerRegistration, /runpod_endpoint_discovery_configured/);
  assert.match(providerRegistration, /external_provider_fallback_allowed:\s*false/);
  assert.match(providerRegistration, /supplier_type:\s*"OWNED_INFERENCE"/);
  assert.match(providerRegistration, /data_control:\s*"AVANTIQO"/);
  assert.match(providerRegistration, /inference_control:\s*"AVANTIQO"/);
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