import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8");
const credentialsRoute = fs.readFileSync("app/api/platform/admin/intelligence-credentials/route.js", "utf8");

test("active Business Partner intelligence is owned-local only", () => {
  assert.match(provider, /executeHierarchicalLocalIntelligence/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal\(input\)/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /executeIntelligenceModalDirect|RunPod|runpod/);
});

test("intelligence health and registration expose the same local-only truth", () => {
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.match(wrapper, /local_compute_primary: true/);
  assert.match(wrapper, /local_only: true/);
  assert.match(wrapper, /modal_fallback_allowed: false/);
  assert.match(registration, /local_compute_primary:\s*true/);
  assert.match(registration, /local_only:\s*true/);
  assert.match(registration, /modal_fallback_allowed:\s*false/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
});

test("provider executor never resolves customer credentials for Avantiqo intelligence", () => {
  assert.match(executor, /if \(provider === "avantiqo-intelligence"\) return null/);
});

test("retired cloud Intelligence credential endpoint is read-only local-policy truth", () => {
  assert.match(credentialsRoute, /retired:true/);
  assert.match(credentialsRoute, /policy:"LOCAL_ONLY"/);
  assert.match(credentialsRoute, /modal_credentials_supported:false/);
  assert.match(credentialsRoute, /AVANTIQO_CLOUD_INTELLIGENCE_CREDENTIALS_RETIRED_LOCAL_ONLY/);
  assert.doesNotMatch(credentialsRoute, /CredentialProvisioningRuntime|MODAL_TOKEN|RUNPOD_API_KEY/);
});
