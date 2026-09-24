import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");

test("legacy RunPod Safe Lease Music certification workflow stays retired", () => {
  assert.equal(fs.existsSync(".github/workflows/avantiqo-music-certification.yml"), false);
  assert.equal(fs.existsSync("scripts/benchmark-avantiqo-music.mjs"), false);
  assert.equal(fs.existsSync("scripts/run-avantiqo-music-controlled-benchmark-local.mjs"), false);
});

test("production Music certification authority is local-only and non-fallback", () => {
  assert.match(registration, /local_only_execution:true/);
  assert.match(registration, /modal_fallback_allowed:false/);
  assert.match(registration, /external_provider_fallback_allowed:false/);
  assert.doesNotMatch(provider, /RunPod|SAFE_LEASE|runpod/);
});
