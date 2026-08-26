import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceFastProvider.js",
    import.meta.url,
  ),
  "utf8",
);

test("Fast Intelligence uses the owned Instruct lane and supported RunPod OpenAI transport", () => {
  assert.match(provider, /Qwen\/Qwen3-30B-A3B-Instruct-2507/);
  assert.match(provider, /CANONICAL_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1"/);
  assert.match(provider, /execution_lane: "fast"/);
  assert.match(provider, /reasoning_mode: "NON_THINKING_ONLY"/);
  assert.match(provider, /raw_reasoning_persisted: false/);
  assert.match(provider, /RUNPOD_OPENAI_COMPATIBLE/);
  assert.match(provider, /baseUrl: `\$\{RUNPOD_API_BASE\}\/\$\{endpointId\}\/openai\/v1`/);
  assert.match(provider, /`\$\{baseUrl\}\/chat\/completions`/);
  assert.match(provider, /method: "POST"/);
  assert.doesNotMatch(provider, /`\$\{apiBase\}\/run`/);
  assert.doesNotMatch(provider, /RUNPOD_NATIVE_ASYNC_VLLM_PROXY/);
});

test("Fast Intelligence fails closed on reasoning transport and requires governed context", () => {
  assert.match(provider, /AVANTIQO_INTELLIGENCE_FAST_GOVERNED_CONTEXT_REQUIRED/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_FAST_REASONING_TRANSPORT_FORBIDDEN/);
  assert.match(provider, /reasoning_transport_detected: false/);
  assert.match(provider, /organization_id/);
  assert.match(provider, /organization_service_id/);
  assert.match(provider, /usage_id/);
});
