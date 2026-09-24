import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorLocalQueueProvider.js", "utf8");
const readiness = fs.readFileSync("app/api/creative/music/readiness/route.js", "utf8");
const engine = fs.readFileSync("lib/creative/runtime/engines/MusicEngine.js", "utf8");

test("separator execution is Node01-local, exact-model and certification gated", () => {
  assert.match(local, /CAPABILITY = "ai\.audio\.stems"/);
  assert.match(local, /MODEL = "demucs-htdemucs-ft"/);
  assert.match(local, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED/);
  assert.match(local, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_NOT_CERTIFIED/);
  assert.match(local, /lane:"gpu"/);
  assert.doesNotMatch(local, /Modal|RunPod|SAFE_LEASE/);
});

test("readiness combines deployed local runtime with certification authority", () => {
  assert.match(readiness, /capability_runtime_available\?\.stems === true/);
  assert.match(readiness, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED/);
  assert.match(readiness, /const stemsReady = stems\.ready === true && separatorRuntimeReady/);
});

test("stems and backing-track remain closed until certification", () => {
  assert.match(engine, /stems:\s*Object\.freeze\([\s\S]*implementation:\s*"IMPLEMENTED"[\s\S]*certification:\s*"BENCHMARK_AND_HUMAN_REVIEW_REQUIRED"/);
  assert.match(engine, /backing_track:\s*Object\.freeze\([\s\S]*implementation:\s*"IMPLEMENTED"[\s\S]*certification:\s*"BENCHMARK_AND_HUMAN_REVIEW_REQUIRED"/);
  assert.match(engine, /return runtimeReady \? "CERTIFIED" : contract\.certification/);
});
