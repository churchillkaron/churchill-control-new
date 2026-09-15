import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMusicCreativeDevelopment,
  evaluateMusicDailies,
} from "../lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js";
import { buildWorldClassMusicStudioPlan } from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

test("Music Studio builds three independent concepts before production", () => {
  const development = buildMusicCreativeDevelopment({ objective: "Create a cinematic original song for a global technology film" });
  assert.equal(development.concept_competition.concept_count, 3);
  assert.equal(development.concept_competition.concepts.length, 3);
  assert.equal(development.concept_competition.blind_independent_scoring, true);
  assert.equal(development.preproduction.expensive_generation_before_lock_allowed, false);
});
test("Music dailies reject missing intended-vs-rendered evidence", () => {
  const result = evaluateMusicDailies({
    intended: { emotional_arc: "build" },
    rendered: {},
    reviews: [],
  });
  assert.equal(result.passed, false);
  assert.equal(result.status, "REJECTED_FOR_REPAIR");
  assert.ok(result.failures.some((item) => item.includes("INTENDED_CONTRACT_REQUIRED")));
  assert.ok(result.failures.some((item) => item.includes("RENDERED_EVIDENCE_REQUIRED")));
});

test("World-class plan embeds the creative-development contract", () => {
  const plan = buildWorldClassMusicStudioPlan({ objective: "Create an original instrumental with a strong emotional arc" });
  assert.equal(plan.creative_development.contract, "AVANTIQO_MUSIC_CREATIVE_DEVELOPMENT_V2");
  assert.equal(plan.creative_development.concept_competition.weighted_winner_required, true);
});

test("concept competition rejects collapsed musical directions", async () => {
  const mod = await import("../lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js");
  const base = {
    id: "a", central_musical_proposition: "slow piano pulse with rising strings",
    emotional_arc: "quiet to hopeful", motif_and_hook_system: "three note motif",
    harmony_language: "minor to suspended major", rhythm_and_groove: "restrained pulse",
    instrumentation: "piano strings", arrangement_arc: "sparse to wide",
    performance_direction: "human restrained", sonic_identity: "intimate cinematic",
    mix_space_intent: "close then wide", signature_moments: ["final lift"], production_method: "live-feel hybrid",
  };
  const result = mod.evaluateMusicConceptDiversity([{...base,id:"a"},{...base,id:"b"},{...base,id:"c"}]);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((value) => value.startsWith("MUSIC_CONCEPTS_NOT_INDEPENDENT")));
});

test("critic competition requires every specialist floor", async () => {
  const mod = await import("../lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js");
  const plan = mod.buildMusicCreativeDevelopment({ objective: "Create an original cinematic song" });
  const concepts = plan.concept_competition.concepts.map((row) => ({ id: row.id }));
  const reviews = [];
  for (const concept of concepts) for (const critic of plan.concept_competition.critics) reviews.push({
    concept_id: concept.id, critic_id: critic.id, score: critic.id === "brief_fidelity" ? 89 : 96, passed: true,
  });
  const result = mod.scoreMusicConceptCompetition({ concepts, critic_reviews: reviews });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("MUSIC_CRITIC_REJECTED:brief_fidelity"));
});

test("preproduction must be complete before generation", async () => {
  const mod = await import("../lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js");
  const result = mod.validateMusicPreproductionBrief({ tempo_map: { bpm: 96 } });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("MUSIC_PREPRODUCTION_FIELD_REQUIRED:delivery_targets"));
});


test("vocal song preproduction fails closed without locked lyrics", async () => {
  const mod = await import("../lib/creative/music/runtime/CreativeMusicCreativeDevelopmentRuntime.js");
  const base = {
    tempo_map: { bpm: 108 }, key_and_harmony: { key: "A minor" },
    form_and_section_lengths: ["verse", "hook"], motif_map: ["hook"], instrumentation: ["percussion"],
    performance_direction: { feel: "human" }, dynamic_arc: ["build"], sonic_palette: ["warm"],
    transition_map: ["lift"], mix_space_intent: { vocal: "intimate" }, delivery_targets: { format: "wav" },
    vocal_contract: { required: true, vocal_language: "english", lyrics: "" },
  };
  const result = mod.validateMusicPreproductionBrief(base, { vocal_required: true });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("MUSIC_PREPRODUCTION_LYRICS_REQUIRED"));
});
