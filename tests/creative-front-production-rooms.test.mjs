import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCreativeFloor,
  evaluateConceptCompetition,
} from "../lib/creative/production-room/runtime/CreativeFrontProductionRoomsRuntime.js";


function validBenchmarkLab() {
  const analysis = Object.fromEntries(["narrative","editing","cinematography","visual_beauty","humanity","place","sound","production_craft"].map((key) => [key, `Detailed ${key} analysis explains observable craft mechanisms and the downstream decision they should change without copying execution.`]));
  return {
    contract: "CREATIVE_BENCHMARK_LAB_V1",
    studies: ["reference-a","reference-b","reference-c"].map((title, index) => ({ title, source_ref: `source-${index + 1}`, analysis })),
    craft_dna: {
      transferable_principles: Array.from({ length: 8 }, (_, index) => `transferable principle ${index + 1}`),
      anti_copy_rules: ["no shot copying","no script copying","no branded composition copying"],
      sound_principles: ["dynamic range","diegetic causality","silence has structure"],
      editorial_principles: ["duration contrast","earned cuts","protect payoff time"],
      cinematography_principles: ["scale contrast","depth","motivated movement"],
    },
  };
}

function validCreativeFloorPlan() {
  return {
    temporal_contract: { human_place_patience_required: true },
    concept: {
      signature_images: ["hero macro", "hero human", "hero place", "hero scale", "hero reveal"],
      task_truth: {
        real_problem: "Fragmented daily operations steal attention from people doing meaningful work across many industries.",
        human_tension: "People remain responsible for outcomes while scattered systems force them to carry coordination in their heads.",
        brand_reason_to_exist: "The platform exists to absorb operational fragmentation and return attention to real work and human relationships.",
        evidence_refs: ["fixture:task"],
      },
      human_truth: {
        lived_behavior_or_ritual: "A worker checks a damp handwritten note, adjusts a real task, and continues without acknowledging a camera.",
        emotional_contradiction: "Competence and pressure coexist because the person knows the work but still carries avoidable system friction.",
        why_it_matters: "The audience recognizes lived responsibility instead of a performer demonstrating an industry category.",
        evidence_refs: ["fixture:human"],
      },
      place_truth: {
        why_here_not_anywhere: "Weather, distance, architecture and local operating conditions materially change how the work is performed.",
        environmental_pressures: ["wind changes physical handling", "distance changes timing and coordination"],
        cultural_or_working_details: ["paper handoffs remain visible", "people coordinate around local spatial constraints"],
        evidence_refs: ["fixture:place"],
      },
      patience_strategy: {
        what_to_withhold: "Do not explain the system before the audience has felt the fragmented human reality it must solve.",
        what_to_let_breathe: "Allow one real work action and its consequence to complete before changing geography or category.",
        exit_trigger: "Cut only when a gesture, sound, environmental change or completed action changes what the audience understands.",
        anti_stasis_rule: "Every hold must continue evolving through performance, sound, weather, depth, focus or composition.",
      },
    },
    story: {
      hook: "Begin with one precise human action whose consequence is larger than the person can see.",
      emotional_arc: "Move from intimate responsibility through mounting complexity toward calm systemic clarity without losing the human scale.",
    },
    anti_cliche_rules: ["no posed teamwork", "no generic dashboard montage"],
  };
}
test("creative floor rejects generic or incomplete concept foundations", () => {
  const weak = evaluateCreativeFloor({ plan: { story: {}, anti_cliche_rules: [] }, reference_strategy: {}, taste_learning: {} });
  assert.equal(weak.passed, false);
  assert.ok(weak.failures.includes("CREATIVE_FLOOR_STORY_HOOK_REQUIRED"));
  assert.ok(weak.failures.includes("CREATIVE_FLOOR_REFERENCE_STRATEGY_REQUIRED"));
});

test("creative floor passes evidence-backed human place patience and bounded taste learning", () => {
  const result = evaluateCreativeFloor({
    plan: validCreativeFloorPlan(),
    reference_strategy: { benchmark_archetypes: ["DOCUMENTARY_TRUTH_PLACE_HUMANITY"] },
    benchmark_lab: validBenchmarkLab(),
    taste_learning: { authority: "ADVISORY_ONLY" },
  });
  assert.equal(result.passed, true, result.failures.join(","));
});

test("concept competition requires three distinct concepts five critics and human-place critique", () => {
  const concepts = ["a", "b", "c"].map((id) => ({ id }));
  const critics = ["originality", "music_energy", "brand_commercial", "production", "human_place_patience"]
    .map((id) => ({ id }));
  const result = evaluateConceptCompetition({ council: {
    contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    concepts,
    critic_reports: critics,
    distinctness: { passed: true },
    selection: { selected_concept: concepts[1] },
  } });
  assert.equal(result.passed, true, result.failures.join(","));
});
