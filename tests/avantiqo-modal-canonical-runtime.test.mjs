import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("config/avantiqo-modal-canonical-runtime.json"));
const productionSources = [
  "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js",
  "lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js",
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  "lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js",
  "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js",
  "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js",
  "services/avantiqo-video-engine/modal_app.py",
  "services/avantiqo-intelligence-modal/modal_app.py",
  "services/avantiqo-intelligence-modal/modal_front_app.py"
].map(read).join("\n");

test("canonical Modal runtime forbids legacy gateways canaries and Wan", () => {
  assert.equal(manifest.policy.minimum_containers, 0);
  assert.equal(manifest.policy.legacy_gateways_forbidden, true);
  assert.equal(manifest.policy.legacy_canaries_forbidden, true);
  assert.equal(manifest.policy.wan_forbidden, true);
  assert.doesNotMatch(productionSources, /avantiqo-[a-z0-9-]+-gateway/);
  assert.doesNotMatch(productionSources, /snapshot-canary|cert-fastfix|music-quality-test/i);
  assert.doesNotMatch(productionSources, /Wan-AI|WAN22|VACE-14B/i);
});

test("canonical Modal app names are unique and bounded", () => {
  const names = manifest.apps.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length <= 10);
  assert.ok(manifest.models.length <= 20);
});
