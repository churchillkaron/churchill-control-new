import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildIntelligenceModalDirectPayload,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js";

const canonicalProviderSource = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", import.meta.url),
  "utf8",
);
const providerV2Source = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", import.meta.url),
  "utf8",
);
const directRuntimeSource = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", import.meta.url),
  "utf8",
);
const registrationSource = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", import.meta.url),
  "utf8",
);
const executorSource = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/ProviderExecutor.js", import.meta.url),
  "utf8",
);
const modalWorkerSource = fs.readFileSync(
  new URL("../services/avantiqo-intelligence-modal/modal_app.py", import.meta.url),
  "utf8",
);

test("Intelligence text-only Modal payload omits all tool fields", () => {
  const payload = buildIntelligenceModalDirectPayload({
    capability: "ai.text.generate",
    prompt: "hello",
    temperature: 0.1,
  }, {
    organizationId: "org-test",
    usageId: "usage-test",
  }, "fast");
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "tools"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "tool_choice"), false);
  assert.equal(payload.execution_lane, "fast");
});

test("Intelligence direct transport mirrors working Audio Modal SDK pattern", () => {
  assert.match(directRuntimeSource, /const APP_NAME = "avantiqo-intelligence-owned"/);
  assert.match(directRuntimeSource, /const DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1"/);
  assert.match(directRuntimeSource, /new sdk\.ModalClient/);
  assert.match(directRuntimeSource, /client\.functions\.fromName\(APP_NAME, lane, lookupOptions\)/);
  assert.match(directRuntimeSource, /worker\.spawn\(\[payload\]\)/);
  assert.match(directRuntimeSource, /client\.functionCalls\.fromId\(callId\)/);
  assert.match(directRuntimeSource, /call\.get\(\{ timeoutMs: 0 \}\)/);
  assert.match(directRuntimeSource, /modal_gateway_used:\s*false/);
  assert.match(directRuntimeSource, /modal_gpu:\s*"H100"/);
  assert.match(directRuntimeSource, /modal_volume_created:\s*false/);
  assert.doesNotMatch(directRuntimeSource, /Runpod|RunPod|RUNPOD/);
});

test("active Intelligence provider is Modal-only and fails closed without Modal", () => {
  assert.match(providerV2Source, /AVANTIQO_INTELLIGENCE_MODAL_DIRECT_CONFIGURATION_REQUIRED/);
  assert.match(providerV2Source, /return executeIntelligenceModalDirect\(input\)/);
  assert.match(providerV2Source, /AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_ID_REQUIRED/);
  assert.doesNotMatch(providerV2Source, /Runpod|RunPod|RUNPOD/);

  assert.match(canonicalProviderSource, /infrastructure_fallback:\s*null/);
  assert.match(canonicalProviderSource, /modal_only:\s*true/);
  assert.match(canonicalProviderSource, /runtime_ready:\s*modalConfigured/);
  assert.doesNotMatch(canonicalProviderSource, /Runpod|RunPod|RUNPOD/);
});

test("Intelligence registration is Modal-only", () => {
  assert.match(registrationSource, /infrastructure_provider:\s*"MODAL_H100_ASYNC_V1"/);
  assert.match(registrationSource, /infrastructure_candidates:\s*\["MODAL_H100_ASYNC_V1"\]/);
  assert.match(registrationSource, /modal_only:\s*true/);
  assert.match(registrationSource, /runtimeAvailable = Boolean\(modalConfigured/);
  assert.doesNotMatch(registrationSource, /Runpod|RunPod|RUNPOD/);
});

test("Intelligence Modal worker uses official vLLM and no RunPod artifact", () => {
  assert.match(modalWorkerSource, /BASE_IMAGE = "vllm\/vllm-openai:v0\.27\.0"/);
  assert.match(modalWorkerSource, /GPU = "H100"/);
  assert.match(modalWorkerSource, /"infrastructure_provider": "MODAL_H100_ASYNC_V1"/);
  assert.doesNotMatch(modalWorkerSource, /Runpod|RunPod|RUNPOD/);
});

test("shared ProviderExecutor contains no Intelligence RunPod lease or pod fallback routing", () => {
  assert.doesNotMatch(executorSource, /OwnedIntelligenceRequestLeaseRuntime/);
  assert.doesNotMatch(executorSource, /OwnedIntelligenceFastPodLeaseRuntime/);
  assert.doesNotMatch(executorSource, /OwnedIntelligenceFastPodFallbackRuntime/);
  assert.doesNotMatch(executorSource, /AvantiqoIntelligenceFastPodProvider/);
  assert.doesNotMatch(executorSource, /AvantiqoIntelligenceSafeLeaseGuard/);
  assert.match(executorSource, /const result = await executeProviderCore\(options\)/);
});
