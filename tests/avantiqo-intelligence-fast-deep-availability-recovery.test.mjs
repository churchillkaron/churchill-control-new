import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");

test("Fast and Deep remain local-primary and require approved proposal for Modal overflow", () => {
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal\(effectiveInput\)/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED/);
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.match(provider, /resolveApprovedIntelligenceModalOverflowBinding/);
  assert.match(provider, /overflowProposalCreationAllowed/);
  assert.doesNotMatch(provider, /fallback.*RunPod|automatic.*Modal/i);
});
