import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MUSIC_SFX_CERTIFICATION_FIXTURES, MUSIC_SFX_CERTIFICATION_REQUIRED_CATEGORIES } from "../scripts/music-sfx-certification-fixtures.mjs";

const run = await readFile("scripts/run-avantiqo-music-sfx-certification-local.mjs", "utf8");

test("SFX certification requires six diverse categories", () => {
  assert.equal(MUSIC_SFX_CERTIFICATION_FIXTURES.length, 6);
  assert.deepEqual(new Set(MUSIC_SFX_CERTIFICATION_REQUIRED_CATEGORIES).size, 6);
  for (const category of ["foley","ambience","impact","transition","mechanical_real_world","cinematic_texture"]) {
    assert.ok(MUSIC_SFX_CERTIFICATION_REQUIRED_CATEGORIES.includes(category));
  }
});

test("SFX runner selects fixture dynamically rather than hardcoding alarm only", () => {
  assert.match(run, /AVANTIQO_MUSIC_SFX_CERTIFICATION_FIXTURE_ID/);
  assert.match(run, /MUSIC_SFX_CERTIFICATION_FIXTURES\.find/);
  assert.match(run, /fixture_category:fixture\.category/);
  assert.match(run, /fixture_id:fixture\.id/);
});
