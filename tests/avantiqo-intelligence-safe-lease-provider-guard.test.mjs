import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const canonical = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const overflow = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalOverflowPolicy.js", "utf8");
const executionLedger = fs.readFileSync("lib/platform/service-runtime/governance/IntelligenceModalOverflowExecutionRuntime.js", "utf8");
const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutor.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("active Intelligence provider is owned-local primary with no Safe Lease fallback", () => {
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal\(effectiveInput\)/);
  assert.match(provider, /intelligenceModalOverflowApprovalRequested\(effectiveInput\)/);
  assert.match(canonical, /runtime_ready: enabled && localConfigured/);
  assert.match(canonical, /automatic_modal_fallback_allowed: false/);
  assert.doesNotMatch(provider, /OwnedIntelligenceRequestLeaseRuntime|RunPod|runpod/);
});

test("Modal overflow uses database approval not external lease authority", () => {
  assert.match(registration, /modal_overflow_owner_approval_required:\s*true/);
  assert.match(registration, /modal_overflow_local_insufficiency_proof_required:\s*true/);
  assert.match(overflow, /AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_REQUIRED/);
  assert.match(executionLedger, /claim_intelligence_modal_overflow_execution/);
  assert.doesNotMatch(registration, /endpoint_id|RUNPOD_SAFE_LEASE/);
});

test("local queue remains the durable primary asynchronous transport", () => {
  assert.match(queue, /supabase-pull-queue-v1/);
  assert.match(queue, /avantiqo_local_compute_jobs/);
  assert.match(queue, /local-intelligence:/);
});

test("shared ProviderExecutor contains no legacy Intelligence lease/fallback routing", () => {
  assert.doesNotMatch(executor, /OwnedIntelligenceRequestLeaseRuntime/);
  assert.doesNotMatch(executor, /OwnedIntelligenceFastPodLeaseRuntime/);
  assert.doesNotMatch(executor, /AvantiqoIntelligenceFastPodProvider/);
  assert.match(executor, /const result = await executeProviderCore\(options\)/);
});
