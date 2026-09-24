import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const engine = fs.readFileSync("lib/creative/runtime/engines/MusicEngine.js", "utf8");
const route = fs.readFileSync("app/api/creative/music/remix/route.js", "utf8");

test("retired RunPod transform candidate provisioning stays absent", () => {
  assert.equal(fs.existsSync("scripts/provision-avantiqo-music-transform-candidate-runpod-local.mjs"), false);
  assert.equal(fs.existsSync("scripts/preflight-avantiqo-music-transform-candidate-local.mjs"), false);
});

test("Remix Edit and Extend remain research-only and cannot reach production provider", () => {
  assert.match(engine, /capability: "ai\.audio\.remix"[\s\S]*implementation: "RESEARCH_ONLY"/);
  assert.match(engine, /capability: "ai\.audio\.edit"[\s\S]*implementation: "RESEARCH_ONLY"/);
  assert.match(engine, /capability: "ai\.audio\.extend"[\s\S]*implementation: "RESEARCH_ONLY"/);
  assert.match(route, /CREATIVE_MUSIC_TRANSFORM_NOT_CERTIFIED/);
  assert.doesNotMatch(provider, /capability === "ai\.audio\.(remix|edit|extend)"/);
});
