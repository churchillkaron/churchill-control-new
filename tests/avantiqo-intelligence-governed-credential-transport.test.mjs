import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", import.meta.url),
  "utf8",
);
const provider = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", import.meta.url),
  "utf8",
);
const providerFacade = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", import.meta.url),
  "utf8",
);
const registration = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", import.meta.url),
  "utf8",
);
const executor = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/ProviderExecutorCore.js", import.meta.url),
  "utf8",
);


test("Intelligence consumes only the server-injected provider credential object before environment fallback", () => {
  assert.match(runtime, /function governedModalCredential\(input = \{\}\)/);
  assert.match(runtime, /const credential = object\(input\.credential\)/);
  assert.match(runtime, /function processEnvModalCredential\(\)/);
  assert.match(runtime, /const governed = governedModalCredential\(input\)/);
  assert.match(runtime, /source: "provider_credential"/);
  assert.match(runtime, /source: "process_env"/);
  assert.doesNotMatch(runtime, /input\.modal_token_id/);
  assert.doesNotMatch(runtime, /input\.modalTokenId/);
  assert.doesNotMatch(runtime, /input\.token_secret/);
});


test("Intelligence credential validation stays fail closed at execution", () => {
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_MODAL_TOKEN_ID_REQUIRED/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_MODAL_TOKEN_SECRET_REQUIRED/);
  assert.match(runtime, /AVANTIQO_INTELLIGENCE_MODAL_DIRECT_CONFIGURATION_REQUIRED/);
  assert.match(runtime, /const cfg = config\(input\)/);
  assert.doesNotMatch(provider, /requireModalDirect/);
  assert.doesNotMatch(provider, /intelligenceModalDirectConfigured/);
  assert.match(provider, /return executeIntelligenceModalDirect\(input\)/);
  assert.match(provider, /return getIntelligenceModalDirectStatus\(input\)/);
});


test("Provider discovery is not coupled to process-local Modal credentials", () => {
  assert.match(registration, /const runtimeAvailable = Boolean\(engineEnabled \|\| localReviewRuntimeAllowed\)/);
  assert.doesNotMatch(registration, /runtimeAvailable = Boolean\(modalConfigured &&/);
  assert.match(registration, /credential_transport:\s*"PROVIDER_EXECUTOR_GOVERNED_SECRET_BROKER_OR_PROCESS_ENV_V2"/);
  assert.match(registration, /server_secret_broker:\s*"SUPABASE_VAULT_ROW_BOUND_SERVICE_ROLE_RPC_V1"/);
  assert.match(registration, /runtime_credentials_required_at_execution:\s*true/);
  assert.match(registration, /async_direct_modal:\s*true/);
  assert.match(registration, /modal_process_env_configured:\s*modalConfigured/);
});


test("Provider facade readiness reflects the runtime contract rather than process-local credentials", () => {
  assert.match(providerFacade, /runtime_ready:\s*enabled/);
  assert.match(providerFacade, /runtime_credentials_required_at_execution:\s*true/);
  assert.match(providerFacade, /provider_executor_credential_injection:\s*true/);
  assert.match(providerFacade, /modal_process_env_configured:\s*processEnvConfigured/);
  assert.doesNotMatch(providerFacade, /runtime_ready:\s*modalConfigured/);
});


test("Provider executor owns credential injection and keeps credential reserved from business input", () => {
  assert.match(executor, /resolveProviderCredential/);
  assert.match(executor, /const credential = await executionCredential\(provider, context\)/);
  assert.match(executor, /credential:\s*credential \|\| null/);
  assert.match(executor, /"credential"/);
  assert.match(executor, /RESERVED_BUSINESS_INPUT_KEYS/);
});
