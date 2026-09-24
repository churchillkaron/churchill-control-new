import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }

test("credential runtime never treats opaque references as resolved secrets", () => {
  const runtime = source("lib/platform/service-runtime/credentials/runtime/CredentialRuntime.js");
  const broker = source("lib/platform/service-runtime/credentials/runtime/ProviderCredentialSecretBroker.js");
  assert.match(runtime, /resolveProviderCredentialSecret/);
  assert.match(broker, /PROVIDER_CREDENTIAL_SECRET_REFERENCE_SCHEME_UNSUPPORTED/);
  assert.match(broker, /reference\.toLowerCase\(\)\.startsWith\("vault:"\)/);
  assert.match(broker, /resolve_provider_credential_vault_secret/);
});

test("owned Intelligence declares local-only credential authority", () => {
  const registration = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialRegistration.js");
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js");
  const provisioning = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialProvisioningRuntime.js");
  assert.match(registration, /LOCAL_ONLY_NO_PROVIDER_CREDENTIAL/);
  assert.match(provider, /local_only:\s*true/);
  assert.match(provider, /modal_fallback_allowed:\s*false/);
  assert.match(provider, /credential_transport:\s*"LOCAL_COMPUTE_QUEUE_V1"/);
  assert.match(provisioning, /credential_required: false/);
  assert.match(provisioning, /credential_provisioning_allowed: false/);
  assert.match(provisioning, /external_compute_allowed: false/);
});

test("Vault broker remains service-role-only, security-invoker and row bound", () => {
  const migration = source("supabase/migrations/20260906023230_provider_credential_vault_broker_security_invoker.sql");
  assert.match(migration, /security invoker/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /pc\.id = p_credential_id/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /grant execute on function public\.resolve_provider_credential_vault_secret\(uuid, text, uuid\) to service_role/i);
});

test("Business Partner stays organization scoped and owned-provider pinned", () => {
  const home = source("components/operator/HomeAvantiqoIntelligence.jsx");
  const route = source("app/api/operator/turn/route.js");
  const owned = source("lib/operator/runtime/OperatorOwnedIntelligenceServiceRuntime.js");
  assert.match(home, /useBusinessContext/);
  assert.match(home, /organizationId/);
  assert.match(home, /entityId/);
  assert.match(home, /periodId/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /resolveBusinessContext/);
  assert.match(owned, /provider_id:\s*OWNED_PROVIDER/);
  assert.match(owned, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
  assert.match(owned, /external_fallback_allowed:\s*false/);
});
