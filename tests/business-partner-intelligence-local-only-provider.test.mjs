import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8");
const credentialsRoute = fs.readFileSync("app/api/platform/admin/intelligence-credentials/route.js", "utf8");
const overflowRoute = fs.readFileSync("app/api/platform/admin/intelligence-modal-overflow/route.js", "utf8");

test("active intelligence provider is local-first and Modal is approval-bound overflow only", () => {
  const localQueue = provider.indexOf("executeIntelligenceLocalQueue(effectiveInput)");
  const localDirect = provider.indexOf("executeIntelligenceLocal(effectiveInput)");
  const modal = provider.indexOf("executeIntelligenceModalDirect({");
  assert.ok(localQueue >= 0 && localDirect >= 0 && modal > localQueue && modal > localDirect);
  assert.match(provider, /intelligenceModalOverflowApprovalRequested\(effectiveInput\)/);
  assert.match(provider, /executionLane === "front"/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED/);
  assert.doesNotMatch(provider, /RunPod|runpod/);
});

test("intelligence health remains local while runtime advertises governed overflow separately", () => {
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.match(wrapper, /local_compute_primary: localConfigured/);
  assert.match(wrapper, /governed_modal_overflow_supported: true/);
  assert.match(wrapper, /governed_modal_overflow_available: overflowConfigured/);
  assert.match(wrapper, /automatic_modal_fallback_allowed: false/);
  assert.match(wrapper, /modal_overflow_owner_approval_required: true/);
});

test("provider registration keeps local readiness and forbids automatic external fallback", () => {
  assert.match(registration, /local_compute_primary:\s*localComputeConfigured/);
  assert.match(registration, /governed_overflow_infrastructure: "MODAL_H100_ASYNC_V1"/);
  assert.match(registration, /external_provider_fallback_allowed: false/);
  assert.match(registration, /governed_external_overflow_allowed: modalOverflowConfigured/);
  assert.match(registration, /automatic_modal_fallback_allowed: false/);
  assert.match(registration, /runtime_credentials_required_at_execution: false/);
});

test("provider executor never resolves customer credentials for Avantiqo intelligence", () => {
  assert.match(executor, /if \(provider === "avantiqo-intelligence"\) return null/);
});

test("intelligence credential endpoint keeps Modal credentials server-managed and non-user-provisionable", () => {
  assert.doesNotMatch(credentialsRoute, /CredentialProvisioningRuntime|MODAL_TOKEN|RUNPOD_API_KEY/);
  assert.match(credentialsRoute, /mode: "LOCAL_FIRST_WITH_GOVERNED_MODAL_OVERFLOW"/);
  assert.match(credentialsRoute, /credential_required: false/);
  assert.match(credentialsRoute, /modal_overflow_server_credentials_managed: true/);
  assert.match(credentialsRoute, /modal_overflow_approval_required: true/);
  assert.match(credentialsRoute, /automatic_modal_fallback_allowed: false/);
  assert.match(credentialsRoute, /AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_CREDENTIALS_SERVER_MANAGED/);
  assert.match(overflowRoute, /requirePlatformAdminAccess/);
});
