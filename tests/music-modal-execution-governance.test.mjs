import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const files = [
  "../lib/creative/music/runtime/CreativeMusicVocalCorrectionTaskRuntime.js",
  "../lib/creative/music/runtime/CreativeMusicAutoStudioRuntime.js",
  "../lib/creative/music/runtime/CreativeMusicAutoStudioExecutionRuntime.js",
  "../lib/creative/music/runtime/CreativeMusicVocalEngineeringRuntime.js",
];
const sources = files.map((file) => fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const joined = sources.join("\n");

test("active Music correction runtimes use owned Modal governance only", () => {
  assert.doesNotMatch(joined, /RUNPOD|RunPod|runpod|SAFE_LEASE|Safe Lease|safe_lease/);
  assert.match(joined, /AVANTIQO_AUDIO_MODAL_A10G_V1/);
  assert.match(joined, /ai\.audio\.vocal-correct/);
  assert.match(joined, /modal_only_execution:\s*true/);
  assert.match(joined, /direct_provider_bypass_allowed:\s*false/);
});

test("vocal correction remains isolated-source, review and certification gated", () => {
  const task = sources[0];
  assert.match(task, /ISOLATED_VOCAL_STEM_REQUIRED/);
  assert.match(task, /production_certification_required:\s*true/);
  assert.match(task, /human_listening_review_required:\s*true/);
  assert.match(task, /source_music_version:\s*1/);
  assert.match(task, /target_music_version:\s*2/);
  assert.match(task, /preserve_vibrato:\s*true/);
  assert.match(task, /preserve_formants:\s*true/);
});
