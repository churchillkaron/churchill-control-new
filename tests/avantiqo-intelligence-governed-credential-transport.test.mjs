import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const provision = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialProvisioningRuntime.js", "utf8");
const legacyRegistration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialRegistration.js", "utf8");

test("Intelligence execution does not consume a provider credential", () => {
  assert.match(executor, /if \(provider === "avantiqo-intelligence"\) return null/);
  assert.match(registration, /runtime_credentials_required_at_execution:\s*false/);
});

test("legacy credential provisioning fails closed for local-only Intelligence", () => {
  assert.match(provision, /AVANTIQO_INTELLIGENCE_CREDENTIALS_NOT_USED_LOCAL_ONLY/);
  assert.match(provision, /credential_provisioning_allowed: false/);
  assert.match(provision, /external_compute_allowed: false/);
});

test("provider discovery is independent of external credential environment", () => {
  assert.doesNotMatch(registration, /MODAL_TOKEN|RUNPOD_API_KEY|credential_type/);
  assert.match(registration, /localComputeConfigured/);
});

test("legacy credential registration has no registration side effect", () => {
  assert.match(legacyRegistration, /LOCAL_ONLY_NO_PROVIDER_CREDENTIAL/);
  assert.doesNotMatch(legacyRegistration, /registerProviderCredentialType|resolveProviderCredential/);
});
