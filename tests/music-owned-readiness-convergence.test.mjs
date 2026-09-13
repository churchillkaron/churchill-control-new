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
