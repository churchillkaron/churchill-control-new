import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const runtime = fs.readFileSync(new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url), "utf8");
const replayGuard = fs.readFileSync(new URL("../lib/intelligence/runtime/AvantiqoToolCallReplayGuardRuntime.mjs", import.meta.url), "utf8");
const registry = fs.readFileSync(new URL("../lib/intelligence/runtime/IntelligenceToolRegistry.js", import.meta.url), "utf8");
const provider = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", import.meta.url), "utf8");
const providerV2 = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", import.meta.url), "utf8");
const providerRegistration = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", import.meta.url), "utf8");

test("reasoning loop is pinned to owned Intelligence through Service Runtime", () => {
  assert.match(runtime, /ServiceExecutionRuntime\.execute/);
  assert.match(runtime, /provider_id:\s*OWNED_PROVIDER/);
  assert.match(runtime, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
  assert.match(runtime, /const OWNED_PROVIDER = "avantiqo-intelligence"/);
});

test("owned Intelligence review pricing is development-only and production stays fail-closed", () => {
  assert.match(runtime, /const LOCAL_REVIEW_SCOPE = "BENCHMARK_REVIEW_PREVIEW"/);
  assert.match(runtime, /localDevelopmentOwnedReviewPolicy/);
  assert.match(runtime, /external_fallback_allowed:\s*false/);
  assert.match(runtime, /production_certified:\s*false/);
});

test("owned Intelligence is local-primary and Modal is explicit overflow only", () => {
  assert.match(provider, /runtime_ready: enabled && localConfigured/);
  assert.match(provider, /governed_modal_overflow_supported: true/);
  assert.match(provider, /governed_modal_overflow_available: overflowConfigured/);
  assert.match(provider, /automatic_modal_fallback_allowed: false/);
  assert.match(providerV2, /executeIntelligenceLocalQueue/);
  assert.match(providerV2, /executeIntelligenceLocal\(effectiveInput\)/);
  assert.match(providerV2, /intelligenceModalOverflowApprovalRequested\(effectiveInput\)/);
  assert.match(providerV2, /executeIntelligenceModalDirect/);
  assert.doesNotMatch(providerV2, /RunPod|runpod/);
});

test("provider registration readiness remains local while overflow is separately governed", () => {
  assert.match(providerRegistration, /runtimeAvailable = Boolean\(\(engineEnabled \|\| localReviewRuntimeAllowed\) && localComputeConfigured\)/);
  assert.match(providerRegistration, /external_provider_fallback_allowed:\s*false/);
  assert.match(providerRegistration, /governed_external_overflow_allowed: modalOverflowConfigured/);
  assert.match(providerRegistration, /modal_overflow_owner_approval_required:\s*true/);
  assert.match(providerRegistration, /automatic_modal_fallback_allowed:\s*false/);
  assert.match(providerRegistration, /supplier_type:\s*"OWNED_INFERENCE"/);
  assert.doesNotMatch(providerRegistration, /RunPod|runpod/);
});

test("reasoning loop remains bounded and replay protection is fail-closed", () => {
  assert.match(runtime, /MAX_TURNS = 20/);
  assert.match(runtime, /MAX_TOOL_CALLS = 64/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_TOOL_CALL_LIMIT_EXCEEDED/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_REASONING_TURN_LIMIT_EXCEEDED/);
  assert.match(replayGuard, /AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED/);
});

test("reasoning loop requires organization scope and feeds tool results back", () => {
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_ORGANIZATION_SCOPE_REQUIRED/);
  assert.match(runtime, /role:\s*"tool"/);
  assert.match(runtime, /tool_call_id:/);
});

test("tool registry fails closed for unknown and unauthorized mutations", () => {
  assert.match(registry, /AVANTIQO_INTELLIGENCE_UNKNOWN_TOOL/);
  assert.match(registry, /AVANTIQO_INTELLIGENCE_MUTATING_TOOL_AUTHORIZATION_REQUIRED/);
  assert.match(registry, /AVANTIQO_INTELLIGENCE_TOOL_APPROVAL_REQUIRED/);
});

test("tool registry exposes only explicit function descriptors", () => {
  assert.match(registry, /type:\s*"function"/);
  assert.match(registry, /TOOL_NAME_PATTERN/);
  assert.doesNotMatch(registry, /eval\s*\(/);
  assert.doesNotMatch(registry, /new Function\s*\(/);
});
