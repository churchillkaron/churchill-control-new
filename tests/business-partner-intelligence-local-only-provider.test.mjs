import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8");
const credentialsRoute = fs.readFileSync("app/api/platform/admin/intelligence-credentials/route.js", "utf8");
const overflowRoute = fs.readFileSync("app/api/platform/admin/intelligence-modal-overflow/route.js", "utf8");

test("active Intelligence provider is local-only", () => {
  const hierarchy = provider.indexOf("shouldUseHierarchicalLocalIntelligence(input)");
  const localQueue = provider.indexOf("shouldUseLocalIntelligenceQueue(input)");
  const localDirect = provider.indexOf("shouldUseLocalIntelligence(input)");
  assert.ok(hierarchy >= 0 && localQueue > hierarchy && localDirect > localQueue);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /Modal|modal|RunPod|runpod/);
});

test("intelligence health is local-only and advertises no external overflow", () => {
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.match(wrapper, /local_compute_primary: localConfigured/);
  assert.match(wrapper, /governed_modal_overflow_supported: false/);
  assert.match(wrapper, /governed_modal_overflow_available: false/);
  assert.match(wrapper, /automatic_modal_fallback_allowed: false/);
  assert.match(wrapper, /modal_overflow_owner_approval_required: false/);
});

test("provider registration is local-only and forbids external fallback", () => {
  assert.match(registration, /local_compute_primary:\s*true/);
  assert.match(registration, /local_only: true/);
  assert.match(registration, /modal_fallback_allowed: false/);
  assert.match(registration, /external_provider_fallback_allowed: false/);
  assert.match(registration, /runtime_credentials_required_at_execution: false/);
});

test("provider executor never resolves customer credentials for Avantiqo intelligence", () => {
  assert.match(executor, /if \(provider === "avantiqo-intelligence"\) return null/);
});

test("cloud Intelligence credentials are retired and non-provisionable", () => {
  assert.doesNotMatch(credentialsRoute, /CredentialProvisioningRuntime|MODAL_TOKEN|RUNPOD_API_KEY/);
  assert.match(credentialsRoute, /policy:"LOCAL_ONLY"/);
  assert.match(credentialsRoute, /modal_credentials_supported:false/);
  assert.match(credentialsRoute, /AVANTIQO_CLOUD_INTELLIGENCE_CREDENTIALS_RETIRED_LOCAL_ONLY/);
});
