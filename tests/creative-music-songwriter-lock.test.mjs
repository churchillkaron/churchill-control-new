import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const floor = fs.readFileSync("lib/creative/music/runtime/CreativeMusicCreativeFloorExecutionRuntime.js", "utf8");
const binding = fs.readFileSync("lib/creative/music/runtime/CreativeMusicProductionBindingRuntime.js", "utf8");

test("vocal songs have a dedicated songwriter lock before preproduction", () => {
  assert.match(floor, /MUSIC_STUDIO_SONGWRITER_LOCK/);
  assert.match(floor, /MUSIC_STUDIO_SONGWRITER_REPAIR/);
  assert.match(floor, /when_songwriter_contract_exists_use_its_lyrics_exactly/);
  assert.match(floor, /songwriter_contract: songwriterContract/);
});

test("Music concept reasoning cannot invent non-AI live-recording provenance", () => {
  assert.match(floor, /owned_ai_music_generation_is_expected: true/);
  assert.match(floor, /do_not_claim_live_recording_or_no_ai_generation_without_actual_recording_evidence: true/);
});

test("generation binding recovers numeric BPM keys and prefers locked sonic palette", () => {
  assert.match(binding, /\.\.\.Object\.keys\(tempo\)/);
  assert.match(binding, /firstText\(compact\(pre\.sonic_palette\), concept\.sonic_identity, input\.style\)/);
});
