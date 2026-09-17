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
  assert.equal(manifest.contract, "AVANTIQO_MODAL_CANONICAL_RUNTIME_V2");
  assert.equal(manifest.policy.local_first_by_default, true);
  assert.equal(manifest.policy.modal_specialist_or_fallback_only, true);
  assert.equal(manifest.policy.idle_scale_to_zero_required, true);
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


test("canonical Modal runtime explicitly separates local-first and specialist capabilities", () => {
  for (const capability of ["ai.text.generate","ai.web.build","ai.app.build","ai.integration.build","ai.music.generate","document.ocr","ai.text.to.speech"]) assert.ok(manifest.local_first_capabilities.includes(capability));
  for (const capability of ["ai.code.invent","ai.video.generate","ai.image.generate","ai.image.analyze"]) assert.ok(manifest.modal_specialist_capabilities.includes(capability));
  for (const app of manifest.apps) assert.ok(/specialist|fallback|explicit-approved/.test(app.role), `invalid Modal role: ${app.name}=${app.role}`);
});
