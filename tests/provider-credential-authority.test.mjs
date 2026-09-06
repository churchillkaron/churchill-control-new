import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("credential runtime never treats opaque references as resolved secrets", () => {
  const runtime = source("lib/platform/service-runtime/credentials/runtime/CredentialRuntime.js");
  const broker = source("lib/platform/service-runtime/credentials/runtime/ProviderCredentialSecretBroker.js");

  assert.match(runtime, /resolveProviderCredentialSecret/);
  assert.doesNotMatch(runtime, /if\s*\(!value\.toLowerCase\(\)\.startsWith\("env:"\)\)\s*\{?\s*return value/);
  assert.match(broker, /PROVIDER_CREDENTIAL_SECRET_REFERENCE_SCHEME_UNSUPPORTED/);
  assert.match(broker, /reference\.toLowerCase\(\)\.startsWith\("vault:"\)/);
  assert.match(broker, /resolve_provider_credential_vault_secret/);
});

test("Intelligence credentials are repository selected, broker resolved and shape validated", () => {
  const registration = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialRegistration.js");
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js");

  assert.match(registration, /managed_modal_credentials/);
  assert.match(registration, /AVANTIQO_OWNED_INTELLIGENCE/);
  assert.match(registration, /CredentialRuntime\.resolve/);
  assert.match(registration, /modal_token_id/);
  assert.match(registration, /modal_token_secret/);
  assert.match(registration, /JSON\.parse/);
  assert.match(provider, /AvantiqoIntelligenceCredentialRegistration\.js/);
  assert.match(provider, /SUPABASE_VAULT_ROW_BOUND_SERVICE_ROLE_RPC_V1/);
  assert.match(provider, /opaque_secret_reference_passthrough_allowed:\s*false/);
});

test("Vault broker is service-role-only, security-invoker and row bound", () => {
  const migration = source("supabase/migrations/20260906023230_provider_credential_vault_broker_security_invoker.sql");

  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /pc\.id = p_credential_id/);
  assert.match(migration, /v_provider_id/);
  assert.match(migration, /v_scoped_organization_id/);
  assert.match(migration, /PROVIDER_CREDENTIAL_VAULT_REFERENCE_REQUIRED/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /revoke all on function public\.resolve_provider_credential_vault_secret\(uuid, text, uuid\) from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.match(migration, /grant execute on function public\.resolve_provider_credential_vault_secret\(uuid, text, uuid\) to service_role/i);
});

test("owned Intelligence credential provisioning accepts secrets only from server environment and serializes retries", () => {
  const runtime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialProvisioningRuntime.js");
  const route = source("app/api/platform/admin/intelligence-credentials/route.js");
  const migration = source("supabase/migrations/20260906023913_serialize_owned_intelligence_credential_provisioning.sql");

  assert.match(runtime, /process\.env\.MODAL_TOKEN_ID/);
  assert.match(runtime, /process\.env\.MODAL_TOKEN_SECRET/);
  assert.match(runtime, /provision_owned_intelligence_modal_credential/);
  assert.match(runtime, /secret_material_returned|secret_reference_scheme|SUPABASE_VAULT/);
  assert.doesNotMatch(route, /request\.json\(/);
  assert.match(route, /requirePlatformOperatorWorkspaceAccess/);
  assert.match(route, /provisionOwnedIntelligenceCredentialFromServerEnvironment/);
  assert.match(route, /secret_material_returned:\s*false/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /pg_catalog\.hashtextextended/);
  assert.match(migration, /metadata ->> 'priority'.*\~ '\^\[0-9\]\+\$'/s);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /vault\.update_secret/);
  assert.match(migration, /'avantiqo-intelligence'/);
  assert.match(migration, /'managed_modal_credentials'/);
  assert.match(migration, /'AVANTIQO_OWNED_INTELLIGENCE'/);
  assert.match(migration, /revoke all on function public\.provision_owned_intelligence_modal_credential\(uuid, text\) from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.match(migration, /grant execute on function public\.provision_owned_intelligence_modal_credential\(uuid, text\) to service_role/i);
});
