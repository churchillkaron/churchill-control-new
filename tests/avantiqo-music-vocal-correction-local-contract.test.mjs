import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionLocalQueueProvider.js", "utf8");
const audio = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const registration = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");

test("vocal correction is certification-gated and local-only", () => {
  assert.match(provider, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED/);
  assert.match(provider, /AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_NODE_UNAVAILABLE/);
  assert.match(provider, /workload:\s*"music_vocal_correction"/);
  assert.match(audio, /AvantiqoMusicVocalCorrectionLocalQueueProvider/);
  assert.match(registration, /capability: "ai\.audio\.vocal-correct"/);
  assert.match(registration, /infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1"/);
  assert.doesNotMatch(audio, /Modal|modal/);
});
