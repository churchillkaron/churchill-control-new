import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextMusicProfessionalProductionAction } from "../lib/creative/music/runtime/CreativeMusicProfessionalProductionRuntime.js";

const continuation = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js", "utf8");
const mix = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalMixRuntime.js", "utf8");

test("instrumental professional plan skips vocal production on resumed stage resolution", () => {
  const plan = { selected_capabilities: [{ id: "create_song" }] };
  const next = nextMusicProfessionalProductionAction({
    plan,
    input: { instrumental: true },
    evidence: { source_generated: true, stems_ready: true },
  });
  assert.equal(next.stage_id, "MIX_ENGINEERING");
  assert.equal(next.manifest.vocals_required, false);
});

test("professional continuation rehydrates instrumental intent from persisted source metadata", () => {
  assert.match(continuation, /instrumental: typeof input\.instrumental === "boolean" \? input\.instrumental : sourceAsset\.metadata\?\.instrumental === true/);
  assert.match(continuation, /professional_release_standard \|\| "PROFESSIONAL_RELEASE"/);
});

test("professional mix also honors persisted instrumental source intent", () => {
  assert.match(mix, /const instrumental=typeof input\.instrumental === "boolean" \? input\.instrumental : sourceAsset\.metadata\?\.instrumental === true/);
  assert.match(mix, /professional_vocal_production_passed!==true && !instrumental/);
});
