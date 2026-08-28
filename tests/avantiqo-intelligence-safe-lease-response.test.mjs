import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../scripts/run-avantiqo-intelligence-safe-lease-response-child-local.mjs", import.meta.url),
  "utf8",
);

test("Intelligence response probe requires Safe Lease V2 and explicit spend approval", () => {
  assert.match(source, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(source, /AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE/);
  assert.match(source, /AVANTIQO_INTELLIGENCE_SAFE_LEASE_RESPONSE_SPEND_APPROVED/);
  assert.match(source, /SAFE_LEASE_V2_REQUIRED/);
  assert.match(source, /SPEND_APPROVAL_REQUIRED/);
});

test("Intelligence response probe supports only governed Intelligence lanes", () => {
  assert.match(source, /"intelligence-fast"/);
  assert.match(source, /"intelligence-fast-candidate"/);
  assert.match(source, /"intelligence-deep"/);
  assert.doesNotMatch(source, /"code"\s*:/);
  assert.doesNotMatch(source, /"image"\s*:/);
  assert.doesNotMatch(source, /"audio"\s*:/);
});

test("Intelligence response probe verifies the exact self-hosted Qwen lane models", () => {
  assert.match(source, /Qwen\/Qwen3-30B-A3B-Instruct-2507/);
  assert.match(source, /Qwen\/Qwen3-30B-A3B-Thinking-2507/);
  assert.match(source, /EXPECTED_MODEL_NOT_SERVED/);
  assert.match(source, /MODEL_MISMATCH/);
});

test("Deep response proof follows Qwen3 Thinking sampling with bounded final-answer budget", () => {
  assert.match(source, /const DEEP_MAX_OUTPUT_TOKENS = 1024/);
  assert.match(source, /const FAST_MAX_OUTPUT_TOKENS = 64/);
  assert.match(source, /const QWEN3_THINKING_TEMPERATURE = 0\.6/);
  assert.match(source, /const QWEN3_THINKING_TOP_P = 0\.95/);
  assert.match(source, /QWEN3_THINKING_2507_RECOMMENDED/);
  assert.match(source, /reasoning_content/);
  assert.match(source, /reasoning_transport_detected/);
  assert.match(source, /EMPTY_FINAL_COMPLETION/);
});

test("Intelligence response proof uses one native HTTPS transport with explicit deadlines", () => {
  assert.match(source, /import https from "node:https"/);
  assert.match(source, /function nativeJsonRequest/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /AbortSignal\.timeout/);
  assert.match(source, /NODE_HTTPS_ALL_ROUTES_ABSOLUTE_DEADLINE_V1/);
  assert.match(source, /NATIVE_HTTPS_DEADLINE_EXCEEDED/);
  assert.match(source, /ambiguous_timeout_retry_performed: false/);
});

test("Intelligence response probe bounds paid inference and begins from a zero-job baseline", () => {
  assert.match(source, /ZERO_JOB_BASELINE_REQUIRED/);
  assert.match(source, /max_tokens: maxOutputTokens/);
  assert.match(source, /approved_generation_count: 1/);
  assert.match(source, /JOB_BOUND_EXCEEDED/);
});

test("Intelligence response probe cannot directly scale RunPod or persist raw reasoning", () => {
  assert.doesNotMatch(source, /rest\.runpod\.io/);
  assert.doesNotMatch(source, /workersMax\s*:/);
  assert.doesNotMatch(source, /workersMin\s*:/);
  assert.match(source, /direct_endpoint_scaling_performed: false/);
  assert.match(source, /workers_max_mutation_performed: false/);
  assert.match(source, /raw_response_persisted: false/);
  assert.match(source, /raw_reasoning_persisted: false/);
  assert.match(source, /production_deploy_performed: false/);
});
