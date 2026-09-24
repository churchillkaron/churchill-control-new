import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const owned = fs.readFileSync("lib/operator/runtime/OperatorOwnedIntelligenceServiceRuntime.js", "utf8");
const reasoning = fs.readFileSync("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8");

test("owned operator intelligence policy forbids external fallback", () => {
  assert.match(owned, /allowed_providers: \[OWNED_PROVIDER\]/);
  assert.match(owned, /owned_only_required: true/);
  assert.match(owned, /external_fallback_allowed: false/);
});

test("healthy local queue deterministically forces the owned local model", () => {
  assert.match(service, /if \(health\?\.ready === true\)/);
  assert.match(service, /allowed_models: \[AVANTIQO_INTELLIGENCE_LOCAL_MODEL\]/);
  assert.match(service, /local_owned_pricing_required: true/);
});

test("Business Partner has no Modal approval conversation", () => {
  assert.doesNotMatch(reasoning, /Approve this one job|modal_overflow_proposal_allowed|modal_compute_approval_id/);
  assert.doesNotMatch(provider, /Modal|modal|RunPod|runpod/);
});
