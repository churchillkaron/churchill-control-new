import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const overflow = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalOverflowPolicy.js", "utf8");

test("owned Intelligence certification is local-primary with governed Modal overflow only", () => {
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal\(effectiveInput\)/);
  assert.match(provider, /intelligenceModalOverflowApprovalRequested\(effectiveInput\)/);
  assert.match(provider, /executeIntelligenceModalDirect/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.match(registration, /governed_modal_overflow_supported:\s*true/);
  assert.match(registration, /governed_modal_overflow_available: modalOverflowConfigured/);
  assert.match(registration, /automatic_modal_fallback_allowed:\s*false/);
  assert.match(queue, /supabase-pull-queue-v1/);
  assert.match(overflow, /AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_REQUIRED/);
  assert.match(overflow, /automatic_fallback: false/);
  assert.doesNotMatch(provider, /RunPod|runpod/);
});
