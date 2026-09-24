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

test("owned Intelligence is local-only and fail closed", () => {
  assert.match(provider, /runtime_ready: enabled && localConfigured/);
  assert.match(provider, /local_only: true/);
  assert.match(provider, /modal_fallback_allowed: false/);
  assert.match(providerV2, /executeHierarchicalLocalIntelligence/);
  assert.match(providerV2, /executeIntelligenceLocalQueue/);
  assert.match(providerV2, /executeIntelligenceLocal\(input\)/);
  assert.match(providerV2, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(providerV2, /Modal|RunPod|runpod/);
});

test("provider registration readiness is owned local compute only", () => {
  assert.match(providerRegistration, /runtimeAvailable = Boolean\(engineEnabled && localComputeConfigured\)/);
  assert.match(providerRegistration, /external_provider_fallback_allowed:\s*false/);
  assert.match(providerRegistration, /local_only:\s*true/);
  assert.match(providerRegistration, /modal_fallback_allowed:\s*false/);
  assert.match(providerRegistration, /supplier_type:\s*"OWNED_INFERENCE"/);
});

test("reasoning loop remains bounded and replay protection is fail-closed", () => {
  assert.match(runtime, /MAX_TURNS = 20/);
  assert.match(runtime, /MAX_TOOL_CALLS = 64/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_TOOL_CALL_LIMIT_EXCEEDED/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_REASONING_TURN_LIMIT_EXCEEDED/);
  assert.match(replayGuard, /AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED/);
});

test("reasoning loop requires organization scope and tool authorization", () => {
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_ORGANIZATION_SCOPE_REQUIRED/);
  assert.match(runtime, /role:\s*"tool"/);
  assert.match(registry, /AVANTIQO_INTELLIGENCE_UNKNOWN_TOOL/);
  assert.match(registry, /AVANTIQO_INTELLIGENCE_MUTATING_TOOL_AUTHORIZATION_REQUIRED/);
  assert.match(registry, /AVANTIQO_INTELLIGENCE_TOOL_APPROVAL_REQUIRED/);
});
