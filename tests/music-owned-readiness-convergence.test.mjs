import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readiness = fs.readFileSync("app/api/creative/music/readiness/route.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");

test("Music readiness follows the owned Modal runtime instead of stale RunPod checks", () => {
  assert.match(readiness, /modal_configured: configuration\.modal_configured === true/);
  assert.match(readiness, /modal_token_id_configured: configuration\.modal_token_id_configured === true/);
  assert.match(readiness, /modal_token_secret_configured: configuration\.modal_token_secret_configured === true/);
  assert.doesNotMatch(readiness, /runpod_endpoint_configured/);
  assert.doesNotMatch(readiness, /runpod_api_key_configured/);
  assert.doesNotMatch(readiness, /management_api_key_configured/);
});

test("owned SFX readiness converges with the implemented certified Modal runtime", () => {
  assert.match(readiness, /const sfxRuntimeReady = providerSfxRuntime\.production_routing_allowed === true/);
  assert.match(readiness, /ready: sfxReady/);
  assert.match(readiness, /runtime_status: text\(providerSfxRuntime\.runtime_status\)/);
  assert.doesNotMatch(readiness, /OWNED_RUNTIME_NOT_IMPLEMENTED/);
  assert.match(registration, /CERTIFIABLE_CAPABILITIES[\s\S]*"ai\.sfx\.generate"/);
});

test("owned stem readiness requires the dedicated certified Modal separator runtime", () => {
  assert.match(readiness, /const separatorRuntimeReady = providerSeparatorRuntime\.production_routing_allowed === true/);
  assert.match(readiness, /const stemsReady = stems\.ready === true && separatorRuntimeReady/);
  assert.match(readiness, /stems: \{ \.\.\.stems, ready: stemsReady/);
  assert.match(registration, /const separatorRuntimeAvailable = Boolean\(engineEnabled && modalConfigured && separatorEngineEnabled && separatorEngineCertified && baseCertifiedCapabilities\.includes\("ai\.audio\.stems"\)\)/);
  assert.match(registration, /runtime_status: separatorRuntimeAvailable \? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED"/);
});


test("readiness rejects stale database certification when current Elastic runtime is not certified", () => {
  assert.match(readiness, /const elasticReady = elastic\.ready === true && elasticRuntimeReady/);
  assert.match(readiness, /stale_database_certification_ignored: elastic\.ready === true && !elasticRuntimeReady/);
  assert.match(readiness, /CURRENT_RUNTIME_CERTIFICATION_REQUIRED/);
});

test("SFX readiness distinguishes benchmark proof from commercial activation", () => {
  assert.match(readiness, /sfx\.benchmark_certified === true \? "COMMERCIAL_ACTIVATION_REQUIRED" : "BENCHMARK_REQUIRED"/);
});


test("Music readiness recognizes the governed local Node 01 generation lane without bypassing certification", () => {
  assert.match(readiness, /AvantiqoMusicLocalNodeProvider/);
  assert.match(readiness, /await AvantiqoMusicLocalNodeProvider\.available\("ai\.music\.generate"\)/);
  assert.match(readiness, /const primaryAudioRuntimeAvailable = modalRuntimeReady \|\| localNodeRuntimeReady/);
  assert.match(readiness, /ready: music\.ready === true && runtimeHealth\.primary_audio_runtime_available === true/);
  assert.match(readiness, /preferred_execution_surface: localNodeRuntimeReady \? "AVANTIQO_LOCAL_NODE_V1"/);
});


test("local Music acceptance is exposed separately from production certification", () => {
  assert.match(readiness, /local_node_live_acceptance/);
  assert.match(readiness, /benchmark_review_preview_allowed/);
  assert.match(readiness, /process\.env\.NODE_ENV !== "production"/);
  assert.match(readiness, /live_acceptance_ready:/);
  assert.match(readiness, /live_acceptance_only:/);
  assert.match(readiness, /LOCAL_ACCEPTANCE_READY/);
  assert.match(readiness, /ready: music\.ready === true && runtimeHealth\.primary_audio_runtime_available === true/);
});
