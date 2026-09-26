import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const handoff = fs.readFileSync("lib/creative/video/runtime/CreativeMusicVideoHandoffRuntime.js", "utf8");
const finalization = fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalFinalizationRuntime.js", "utf8");

test("professional mastering settles the current Music Studio master", () => {
  assert.match(finalization, /settleCurrentMusicMaster/);
  assert.match(finalization, /master_asset_id: evidence\.master_asset_id/);
});

test("music-video handoff is bound to the current music master and exact full-song duration", () => {
  assert.match(handoff, /current_master_asset_id/);
  assert.match(handoff, /render_role: "PRIMARY_SOUNDTRACK"/);
  assert.match(handoff, /timing_authority: true/);
  assert.match(handoff, /no_truncation: true/);
  assert.match(handoff, /no_time_compression: true/);
  assert.match(handoff, /preserve_source_audio: true/);
  assert.match(handoff, /audioAuthorityKind/);
});

test("music-video production profile requires musical alignment and fast verified shot production", () => {
  assert.match(handoff, /require_music_structure_alignment: true/);
  assert.match(handoff, /require_lyric_or_vocal_intent_alignment: true/);
  assert.match(handoff, /require_energy_arc_alignment: true/);
  assert.match(handoff, /parallel_shot_generation: true/);
  assert.match(handoff, /assemble_only_verified_shots: true/);
  assert.match(handoff, /music_bpm/);
  assert.match(handoff, /music_time_signature/);
  assert.match(handoff, /vocal_preparation/);
});
