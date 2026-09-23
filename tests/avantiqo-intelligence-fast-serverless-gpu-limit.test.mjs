import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const overflow = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalOverflowPolicy.js", "utf8");

test("Fast and Deep expose no external GPU fallback", () => {
  assert.match(registration, /local_only: true/);
  assert.match(registration, /modal_fallback_allowed: false/);
  assert.match(registration, /external_provider_fallback_allowed: false/);
  assert.doesNotMatch(provider, /Modal|modal|RunPod|runpod|endpoint_id/);
});
