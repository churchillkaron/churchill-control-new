import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixture = await readFile("scripts/avantiqo-music-continuity-fixture.mjs", "utf8");
const benchmark = await readFile("scripts/benchmark-avantiqo-music-transform.mjs", "utf8");

test("dynamic metal continuity fixture is original and rights-safe", () => {
  assert.match(fixture, /AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_V1/);
  assert.match(fixture, /DYNAMIC_METAL/);
  assert.match(fixture, /original_composition: true/);
  assert.match(fixture, /royalty_free: true/);
  assert.match(fixture, /reference_recording_used: false/);
  assert.match(fixture, /artist_imitation_requested: false/);
});

test("dynamic metal fixture exercises quiet-to-heavy structural continuity", () => {
  assert.match(fixture, /QUIET_CLEAN_ARPEGGIO_INTRO/);
  assert.match(fixture, /TENSION_BUILD/);
  assert.match(fixture, /HEAVY_RIFF/);
  assert.match(fixture, /QUIET_TO_HEAVY/);
  assert.match(fixture, /clean_electric_guitar/);
  assert.match(fixture, /distorted_power_guitar/);
  assert.match(fixture, /B5_UNRESOLVED_DOMINANT_FOR_CONTINUATION_TEST/);
  assert.match(fixture, /CONTINUE_HEAVY_SECTION_WITH_NEW_ORIGINAL_MATERIAL/);
});

test("metal profile still uses the one-job guarded Music Extend certification", () => {
  assert.match(benchmark, /SOURCE_MODE_CONTINUITY = "MUSICAL_CONTINUITY"/);
  assert.match(benchmark, /MUSICAL_CONTINUITY_REQUIRES_EXTEND/);
  assert.match(benchmark, /max_provider_jobs: 1/);
  assert.match(benchmark, /benchmark_runs: 1/);
  assert.match(benchmark, /SAFE_LEASE_LANE = "music-transform-candidate"/);
  assert.match(benchmark, /production_activation_allowed: false/);
  assert.match(benchmark, /pricing_activation_allowed: false/);
  assert.match(benchmark, /provider_selection_change_allowed: false/);
});
