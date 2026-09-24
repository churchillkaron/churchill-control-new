import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorLocalQueueProvider.js", "utf8");
const readiness = fs.readFileSync("app/api/creative/music/readiness/route.js", "utf8");

test("legacy separator cloud certification workflow stays retired", () => {
  assert.equal(fs.existsSync(".github/workflows/avantiqo-music-separator-certification.yml"), false);
});

test("separator production remains local and exact-certification gated", () => {
  assert.match(local, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED/);
  assert.match(local, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_NOT_CERTIFIED/);
  assert.match(local, /demucs-htdemucs-ft/);
  assert.match(local, /lane:"gpu"/);
  assert.match(readiness, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED/);
  assert.doesNotMatch(local, /RunPod|Modal|SAFE_LEASE/);
});
