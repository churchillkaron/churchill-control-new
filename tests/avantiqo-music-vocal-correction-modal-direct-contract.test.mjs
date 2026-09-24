import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const audio = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionLocalQueueProvider.js", "utf8");

test("vocal correction production routing is local and certification gated", () => {
  assert.match(audio, /AvantiqoMusicVocalCorrectionLocalQueueProvider/);
  assert.match(audio, /AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_NODE_UNAVAILABLE/);
  assert.match(local, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED/);
  assert.match(local, /MODEL="torchcrepe-full"/);
  assert.match(local, /corrected_vocal_wav:"wav"/);
  assert.match(local, /correction_report_json:"json"/);
  assert.match(local, /workload:"music_vocal_correction"/);
  assert.doesNotMatch(audio, /Modal|RunPod/);
});
