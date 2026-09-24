import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const fixture = fs.readFileSync("scripts/avantiqo-music-continuity-fixture.mjs", "utf8");
const engine = fs.readFileSync("lib/creative/runtime/engines/MusicEngine.js", "utf8");
const route = fs.readFileSync("app/api/creative/music/remix/route.js", "utf8");

test("dynamic metal continuity fixture is original and rights-safe", () => {
  assert.match(fixture, /AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_V1/);
  assert.match(fixture, /DYNAMIC_METAL/);
  assert.match(fixture, /original_composition: true/);
  assert.match(fixture, /royalty_free: true/);
  assert.match(fixture, /reference_recording_used: false/);
  assert.match(fixture, /artist_imitation_requested: false/);
});

test("dynamic metal fixture exercises quiet-to-heavy structural continuity", () => {
  for (const marker of ["QUIET_CLEAN_ARPEGGIO_INTRO","TENSION_BUILD","HEAVY_RIFF","QUIET_TO_HEAVY","CONTINUE_HEAVY_SECTION_WITH_NEW_ORIGINAL_MATERIAL"]) assert.match(fixture, new RegExp(marker));
});

test("metal continuity Extend stays a research-only plan until a certified active runtime exists", () => {
  assert.match(engine, /capability: "ai\.audio\.extend"[\s\S]*implementation: "RESEARCH_ONLY"/);
  assert.match(route, /CREATIVE_MUSIC_TRANSFORM_NOT_CERTIFIED/);
  assert.match(route, /publication_authorized:\s*false/);
});
