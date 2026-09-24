import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const credentials = fs.readFileSync("app/api/platform/admin/intelligence-credentials/route.js", "utf8");

test("active Intelligence runtime is owned-local only", () => {
  const hierarchy = provider.indexOf("shouldUseHierarchicalLocalIntelligence(input)");
  const queue = provider.indexOf("shouldUseLocalIntelligenceQueue(input)");
  const direct = provider.indexOf("shouldUseLocalIntelligence(input)");
  assert.ok(hierarchy >= 0 && queue > hierarchy && direct > queue);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /executeIntelligenceModalDirect|ModalClient|RunPod/);
});

test("runtime metadata exposes no external overflow", () => {
  assert.match(wrapper, /governed_overflow_infrastructure: null/);
  assert.match(wrapper, /governed_modal_overflow_supported: false/);
  assert.match(wrapper, /governed_modal_overflow_available: false/);
  assert.match(wrapper, /automatic_modal_fallback_allowed: false/);
  assert.match(wrapper, /modal_overflow_server_credentials_required_at_submission: false/);
});

test("provider registration is explicitly local-only", () => {
  assert.match(registration, /local_only: true/);
  assert.match(registration, /modal_fallback_allowed: false/);
  assert.match(registration, /external_provider_fallback_allowed: false/);
  assert.match(registration, /infrastructure_fallback: null/);
});

test("cloud Intelligence credentials are retired", () => {
  assert.match(credentials, /policy:"LOCAL_ONLY"/);
  assert.match(credentials, /modal_credentials_supported:false/);
  assert.match(credentials, /AVANTIQO_CLOUD_INTELLIGENCE_CREDENTIALS_RETIRED_LOCAL_ONLY/);
});
