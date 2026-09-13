import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { deriveMusicSectionMap } from "../lib/creative/music/runtime/CreativeMusicSectionMapRuntime.js";
import { bindMusicPreproductionToGeneration } from "../lib/creative/music/runtime/CreativeMusicProductionBindingRuntime.js";

test("Music section map parses locked human-readable form ranges", () => {
  const map = deriveMusicSectionMap({
    form_and_section_lengths: [
      "0-12 intro",
      "12-36 verse",
      "36-54 chorus",
      "54-72 bridge",
    ],
  });
  assert.equal(map.exact_timing_available, true);
  assert.equal(map.section_count, 4);
  assert.deepEqual(map.sections[2], {
    start_seconds: 36,
    end_seconds: 54,
    label: "chorus",
    source: "PREPRODUCTION_FORM",
    reason: "Locked Music pre-production section timing",
  });
});

test("Music section map derives sequential ranges from structured durations", () => {
  const map = deriveMusicSectionMap({
    form_and_section_lengths: [
      { section: "intro", duration_seconds: 8 },
      { section: "verse", duration_seconds: 16 },
      { section: "chorus", duration_seconds: 20 },
    ],
  });
  assert.deepEqual(
    map.sections.map((row) => [row.start_seconds, row.end_seconds, row.label]),
    [[0, 8, "intro"], [8, 24, "verse"], [24, 44, "chorus"]],
  );
});

test("Music production binding hash path is executable", () => {
  const preproduction = {
    tempo_map: { bpm: 82, time_signature: "4/4" },
    key_and_harmony: { keyscale: "D minor" },
    form_and_section_lengths: ["0-12 intro", "12-36 verse", "36-54 chorus"],
    motif_map: ["motif"],
    instrumentation: ["piano"],
    performance_direction: { piano: "restrained" },
    dynamic_arc: ["quiet", "lift"],
    sonic_palette: ["dark"],
    transition_map: ["breath"],
    mix_space_intent: { opening: "close" },
    delivery_targets: { format: "wav" },
  };
  const bound = bindMusicPreproductionToGeneration({
    input: { objective: "Create the score" },
    creative_floor: {
      contract: "AVANTIQO_MUSIC_CREATIVE_FLOOR_EXECUTION_V1",
      status: "READY_FOR_PRODUCTION_CONFIRMATION",
      winning_concept: {
        id: "concept-1",
        emotional_arc: "mystery to lift",
        motif_and_hook_system: "motif",
        arrangement_arc: "build",
        sonic_identity: "dark organic",
      },
      preproduction_brief: preproduction,
    },
  });
  assert.equal(bound.binding.preproduction_hash.length, 64);
  assert.deepEqual(bound.binding.preproduction_brief.form_and_section_lengths, preproduction.form_and_section_lengths);
});
