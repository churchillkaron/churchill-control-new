import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const config = JSON.parse(fs.readFileSync("config/avantiqo-music-extend-engine.json", "utf8"));
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
const route = fs.readFileSync("app/api/creative/music/remix/route.js", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicRemixPanel.jsx", "utf8");

test("historical Extend candidate preserves exact outpaint semantics but stays non-production", () => {
  assert.equal(config.semantic_scope, "ARRANGEMENT_COMPLETION_ONLY");
  assert.equal(config.temporal_extension_proven, false);
  assert.equal(config.temporal_extend_routing_allowed, false);
  assert.equal(config.temporal_extend_replacement_strategy, "XL_TURBO_REPAINT_RIGHT_OUTPAINT");
  assert.equal(config.production_certified, false);
});

test("active Audio registry does not expose Extend as implemented production capability", () => {
  assert.match(registration, /"ai\.audio\.extend"/);
  assert.match(registration, /target_capabilities:TARGET_CAPABILITIES/);
  assert.doesNotMatch(registration, /implemented_capabilities:[^\n]*ai\.audio\.extend/);
  assert.doesNotMatch(provider, /capability === "ai\.audio\.extend"/);
});

test("Extend planning remains available and execution remains fail closed", () => {
  assert.match(route, /TEMPORAL_EXTEND_STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT"/);
  assert.match(route, /implementation: "RESEARCH_ONLY"/);
  assert.match(route, /certification: "BENCHMARK_REQUIRED"/);
  assert.match(route, /executable: false/);
  assert.match(route, /CREATIVE_MUSIC_TRANSFORM_NOT_CERTIFIED/);
  assert.match(panel, /Temporal outpaint benchmark pending/);
  assert.match(panel, /Extend by seconds/);
  assert.match(panel, /Continuity overlap/);
});
