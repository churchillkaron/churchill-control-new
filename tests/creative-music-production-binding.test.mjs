import test from "node:test";
import assert from "node:assert/strict";
import { bindMusicPreproductionToGeneration } from "../lib/creative/music/runtime/CreativeMusicProductionBindingRuntime.js";

function floor() {
  return {
    contract: "AVANTIQO_MUSIC_CREATIVE_FLOOR_EXECUTION_V1",
    status: "READY_FOR_PRODUCTION_CONFIRMATION",
    competition: { winner_concept_id: "music-concept-emotion" },
    winning_concept: {
      id: "music-concept-emotion",
      emotional_arc: "mystery to controlled lift",
      motif_and_hook_system: "three-note ascending motif",
      arrangement_arc: "sparse opening to wide final resolve",
      sonic_identity: "organic pulse with glass harmonics",
    },
    preproduction_brief: {
      tempo_map: { bpm: 82, time_signature: "4/4" },
      key_and_harmony: { keyscale: "D minor" },
      form_and_section_lengths: ["0-12 intro", "12-36 build", "36-60 resolve"],
      motif_map: ["three-note motif returns at each section turn"],
      instrumentation: ["felt piano", "low pulse", "glass harmonics", "strings"],
      performance_direction: { piano: "human, restrained", strings: "slow bow, no trailer swells" },
      dynamic_arc: ["near silence", "controlled growth", "wide but not loud"],
      sonic_palette: ["dark organic", "precise technology shimmer"],
      transition_map: ["breath gap at 12s", "motif inversion at 36s"],
      mix_space_intent: { opening: "close", ending: "wide" },
      delivery_targets: { format: "wav", sample_rate: 48000 },
    },
  };
}
test("approved Music Creative Floor binds exact production values", () => {
  const bound = bindMusicPreproductionToGeneration({ input: { objective: "Create the score" }, creative_floor: floor() });
  assert.equal(bound.input.bpm, 82);
  assert.equal(bound.input.keyscale, "D minor");
  assert.equal(bound.input.timesignature, "4/4");
  assert.match(bound.input.structure, /0-12 intro/);
  assert.match(bound.input.instrumentation, /felt piano/);
  assert.equal(bound.input.mood, "mystery to controlled lift");
  assert.equal(bound.binding.contract, "AVANTIQO_MUSIC_PRODUCTION_BINDING_V1");
  assert.equal(bound.binding.preproduction_hash.length, 64);
  assert.equal(bound.binding.direction_hash.length, 64);
});
