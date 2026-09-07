import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  registration: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js",
  provider: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoSfxModalProvider.js",
  audio: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js",
  certification: "lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js",
  modal: "services/avantiqo-sfx-modal/modal_app.py",
};

const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])));

test("owned SFX is Modal-only and fail-closed until certified", () => {
  assert.match(source.registration, /AVANTIQO_SFX_MODAL_ENDPOINT_URL/);
  assert.match(source.registration, /AVANTIQO_SFX_ENGINE_CERTIFIED/);
  assert.match(source.registration, /infrastructure_provider: "MODAL"/);
  assert.doesNotMatch(source.provider, /RUNPOD/);
  assert.doesNotMatch(source.provider, /fal-ai|FAL_|provider.*fal/i);
});

test("ai.sfx.generate routes through dedicated owned SFX provider", () => {
  assert.match(source.audio, /isSfxCapability/);
  assert.match(source.audio, /AvantiqoSfxModalProvider\.execute/);
  assert.match(source.provider, /ai\.sfx\.generate/);
  assert.match(source.provider, /OUTPUT_BUCKET = "creative-assets"/);
  assert.match(source.provider, /storage:\/\/\$\{OUTPUT_BUCKET\}/);
});

test("MOSS SFX model is governed and canonical", () => {
  assert.match(source.certification, /OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/);
  assert.match(source.certification, /apache-2\.0/);
  assert.match(source.certification, /48000/);
  assert.match(source.modal, /MossSoundEffectPipeline/);
  assert.match(source.modal, /MAX_SECONDS = 30\.0/);
  assert.match(source.modal, /MODAL_A10G_ASYNC_V1/);
});
