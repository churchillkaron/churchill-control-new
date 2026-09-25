import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url), "utf8");
const registration = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", import.meta.url), "utf8");

test("Audio is local-only and has no cloud execution path", () => {
  assert.match(provider, /local_only: true/);
  assert.match(provider, /AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
  assert.match(provider, /AVANTIQO_AUDIO_LOCAL_JOB_ID_REQUIRED/);
  assert.doesNotMatch(provider, /OwnedModal|ModalDirect|createAvantiqoOwnedModalWorker|import\("modal"\)|MODAL_/);
});

test("Audio registration advertises only Node01 local execution", () => {
  assert.match(registration, /infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(registration, /infrastructure_candidates: \["AVANTIQO_LOCAL_NODE_V1"\]/);
  assert.match(registration, /local_only_execution: true/);
  assert.match(registration, /cloud_fallback_allowed: false/);
  assert.match(registration, /external_provider_fallback_allowed: false/);
  assert.doesNotMatch(registration, /MODAL_|modalConfigured|modal_fallback|ModalDirect/);
});

test("Audio routes every implemented production capability to a local queue provider", () => {
  for (const providerName of [
    "AvantiqoMusicGenerationLocalQueueProvider",
    "AvantiqoSfxLocalQueueProvider",
    "AvantiqoMusicSeparatorLocalQueueProvider",
    "AvantiqoMusicVocalCorrectionLocalQueueProvider",
    "AvantiqoMusicElasticLocalQueueProvider",
  ]) assert.match(provider, new RegExp(providerName));
});
