import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Legacy filename retained for repository mission-safety. Vocal correction now runs only locally.
const audio = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const local = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionLocalQueueProvider.js", "utf8");

test("legacy vocal-correction contract enforces local execution", () => {
  assert.match(audio, /AvantiqoMusicVocalCorrectionLocalQueueProvider/);
  assert.match(local, /AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_NODE_UNAVAILABLE/);
  assert.match(local, /AVANTIQO_LOCAL_NODE_V1/);
  assert.doesNotMatch(audio, /Modal|modal/);
});
