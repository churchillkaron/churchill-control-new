import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const config = JSON.parse(fs.readFileSync("config/avantiqo-music-extend-engine.json", "utf8"));
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const engine = fs.readFileSync("lib/creative/runtime/engines/MusicEngine.js", "utf8");
const route = fs.readFileSync("app/api/creative/music/remix/route.js", "utf8");

test("historical base-complete Extend evidence remains explicitly insufficient for temporal extension", () => {
  assert.equal(config.semantic_scope, "ARRANGEMENT_COMPLETION_ONLY");
  assert.equal(config.temporal_extension_proven, false);
  assert.equal(config.temporal_extend_routing_allowed, false);
  assert.equal(config.temporal_extend_replacement_strategy, "XL_TURBO_REPAINT_RIGHT_OUTPAINT");
});

test("active Extend remains research-only and provider-fail-closed", () => {
  assert.match(engine, /capability: "ai\.audio\.extend"[\s\S]*implementation: "RESEARCH_ONLY"/);
  assert.match(route, /implementation: "RESEARCH_ONLY"/);
  assert.match(route, /CREATIVE_MUSIC_TRANSFORM_NOT_CERTIFIED/);
  assert.doesNotMatch(provider, /capability === "ai\.audio\.extend"/);
});
