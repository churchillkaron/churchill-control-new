import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const task = fs.readFileSync("lib/creative/music/runtime/CreativeMusicVocalCorrectionTaskRuntime.js", "utf8");
const auto = fs.readFileSync("lib/creative/music/runtime/CreativeMusicAutoStudioExecutionRuntime.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");

test("active Music correction runtimes are local-only and have no direct cloud bypass", () => {
  const joined = [task, auto, provider].join("\n");
  assert.doesNotMatch(joined, /RUNPOD|RunPod|runpod|SAFE_LEASE|Safe Lease|safe_lease/);
  assert.match(task, /ai\.audio\.vocal-correct/);
  assert.match(auto, /AVANTIQO_MUSIC_AUTO_STUDIO_LOCAL_EXECUTION_V3/);
  assert.match(provider, /AvantiqoMusicVocalCorrectionLocalQueueProvider/);
});

test("vocal correction remains isolated-source, review and certification gated", () => {
  assert.match(task, /ISOLATED_VOCAL_STEM_REQUIRED/);
  assert.match(task, /production_certification_required:\s*true/);
  assert.match(task, /human_listening_review_required:\s*true/);
  assert.match(task, /source_music_version:\s*1/);
  assert.match(task, /target_music_version:\s*2/);
  assert.match(task, /preserve_vibrato:\s*true/);
  assert.match(task, /preserve_formants:\s*true/);
});
