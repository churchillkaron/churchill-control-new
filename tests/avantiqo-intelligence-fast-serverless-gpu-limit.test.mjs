import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const overflow = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalOverflowPolicy.js", "utf8");

test("Fast/Deep external GPU capacity is governed overflow only", () => {
  assert.match(registration, /governed_overflow_infrastructure: "MODAL_H100_ASYNC_V1"/);
  assert.match(registration, /automatic_modal_fallback_allowed:\s*false/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.match(provider, /intelligenceModalOverflowApprovalRequested\(effectiveInput\)/);
  assert.match(overflow, /explicit_approval_required: true/);
  assert.doesNotMatch(provider, /RunPod|runpod|endpoint_id/);
});
