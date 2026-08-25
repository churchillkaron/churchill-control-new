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

test("Fast Intelligence uses the owned Instruct lane and native RunPod vLLM proxy", () => {
  assert.match(provider, /Qwen\/Qwen3-30B-A3B-Instruct-2507/);
  assert.match(provider, /CANONICAL_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1"/);
  assert.match(provider, /execution_lane: "fast"/);
  assert.match(provider, /reasoning_mode: "NON_THINKING_ONLY"/);
  assert.match(provider, /raw_reasoning_persisted: false/);
  assert.match(provider, /RUNPOD_NATIVE_ASYNC_VLLM_PROXY/);
  assert.match(provider, /`\$\{apiBase\}\/run`/);
  assert.match(provider, /route: "\/v1\/chat\/completions"/);
  assert.match(provider, /method: "POST"/);
  assert.match(provider, /`\$\{apiBase\}\/status\/\$\{encodeURIComponent\(jobId\)\}`/);
  assert.match(provider, /`\$\{apiBase\}\/cancel\/\$\{encodeURIComponent\(jobId\)\}`/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_FAST_NATIVE_JOB_TIMEOUT/);
  assert.match(provider, /openAiResponseFromProxyOutput/);
});

test("Fast Intelligence fails closed on reasoning transport and requires governed context", () => {
  assert.match(provider, /AVANTIQO_INTELLIGENCE_FAST_GOVERNED_CONTEXT_REQUIRED/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_FAST_REASONING_TRANSPORT_FORBIDDEN/);
  assert.match(provider, /reasoning_transport_detected: false/);
  assert.match(provider, /organization_id/);
  assert.match(provider, /organization_service_id/);
  assert.match(provider, /usage_id/);
});
