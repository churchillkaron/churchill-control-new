import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeCinematicImpactRuntime.js", "utf8");

test("cinematic impact critic scores creative taste beyond camera correctness", () => {
  for (const field of [
    "art_direction",
    "visual_design",
    "graphic_motion_design",
    "material_authority",
    "technology_imagination",
    "cinematic_invention",
  ]) assert.ok(source.includes(`"${field}"`), `missing ${field}`);
  assert.match(source, /ordinary coverage plus polish/);
  assert.match(source, /Camera language is secondary to image invention/);
  assert.match(source, /generic HUD overlays, floating UI and decorative data/);
  assert.match(source, /neon lines, particles, generic holograms or stock sci-fi language/);
});