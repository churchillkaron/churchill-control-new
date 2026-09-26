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

test("Intelligence is owned-local and rejects external credential plumbing", () => {
  const registration = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialRegistration.js");
  const provider = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js");

  assert.match(registration, /AVANTIQO_INTELLIGENCE_CREDENTIAL_TYPE = null/);
  assert.match(registration, /LOCAL_ONLY_NO_PROVIDER_CREDENTIAL/);
  assert.doesNotMatch(registration, /managed_modal_credentials|CredentialRuntime\.resolve|modal_token_id|modal_token_secret/);
  assert.match(provider, /local_only:\s*true/);
  assert.match(provider, /modal_fallback_allowed:\s*false/);
  assert.match(provider, /external_provider_fallback_allowed:\s*false/);
  assert.match(provider, /credential_transport:\s*"LOCAL_COMPUTE_QUEUE_V1"/);
  assert.match(provider, /runtime_credentials_required_at_execution:\s*false/);
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

test("owned Intelligence credential provisioning is retired and cannot accept cloud secrets", () => {
  const runtime = source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialProvisioningRuntime.js");
  const route = source("app/api/platform/admin/intelligence-credentials/route.js");

  assert.match(runtime, /AVANTIQO_INTELLIGENCE_LOCAL_ONLY_CREDENTIAL_COMPATIBILITY_V1/);
  assert.match(runtime, /credential_required:\s*false/);
  assert.match(runtime, /credential_provisioning_allowed:\s*false/);
  assert.match(runtime, /external_compute_allowed:\s*false/);
  assert.match(runtime, /secret_material_returned:\s*false/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_CREDENTIALS_NOT_USED_LOCAL_ONLY/);
  assert.doesNotMatch(runtime, /process\.env\.MODAL_TOKEN_ID|process\.env\.MODAL_TOKEN_SECRET/);
  assert.doesNotMatch(route, /request\.json\(/);
  assert.match(route, /policy:\s*"LOCAL_ONLY"/);
  assert.match(route, /modal_credentials_supported:\s*false/);
  assert.match(route, /AVANTIQO_CLOUD_INTELLIGENCE_CREDENTIALS_RETIRED_LOCAL_ONLY/);
  assert.match(route, /status:\s*410/);
});

test("Business Partner binds selected business context to governed owned Intelligence", () => {
  const home = source("components/operator/HomeAvantiqoIntelligence.jsx");
  const route = source("app/api/operator/turn/route.js");
  const fast = source("lib/operator/runtime/OperatorFastConversationRuntime.js");
  const owned = source("lib/operator/runtime/OperatorOwnedIntelligenceServiceRuntime.js");
  const reasoning = source("lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js");

  assert.match(home, /useBusinessContext/);
  assert.match(home, /body:\s*JSON\.stringify\(\{[\s\S]*organizationId,[\s\S]*entityId,[\s\S]*periodId,/);
  assert.match(home, /fetchWithTimeout\([\s\S]*"\/api\/operator\/turn\/live"/);

  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /resolveBusinessContext/);
  assert.match(route, /organizationId:\s*businessContext\.organizationId/);
  assert.match(route, /entityId:\s*businessContext\.entityId/);
  assert.match(route, /periodId:\s*businessContext\.periodId/);
  assert.match(route, /callerRequest:\s*request/);

  assert.match(fast, /runOperatorFrontCognition\(\{/);
  assert.match(fast, /organization_id:\s*organizationId/);
  assert.match(fast, /entity_id:\s*entityId/);
  assert.match(fast, /front_task_mode:\s*"conversation"/);
  assert.match(fast, /allow_fast_escalation:\s*false/);

  assert.match(owned, /ServiceExecutionRuntime\.settle\(\{/);
  assert.match(owned, /provider_id:\s*OWNED_PROVIDER/);
  assert.match(owned, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
  assert.match(owned, /owned_only_required:\s*true/);
  assert.match(owned, /external_fallback_allowed:\s*false/);
  assert.match(owned, /assertOwnedProvider\(execution\?\.provider,\s*"EXECUTION"\)/);
  assert.match(owned, /operator_intelligence_owned_provider_verified:\s*true/);
  assert.match(owned, /external_ai_fallback_used:\s*false/);

  assert.match(reasoning, /const OWNED_PROVIDER = "avantiqo-intelligence"/);
  assert.match(reasoning, /fast:\s*FAST_TEXT_CAPABILITY/);
  assert.match(reasoning, /deep:\s*REASONING_CAPABILITY/);
  assert.match(reasoning, /provider_id:\s*OWNED_PROVIDER/);
  assert.match(reasoning, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
});
