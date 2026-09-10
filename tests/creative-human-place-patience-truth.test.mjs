import test from "node:test";
import assert from "node:assert/strict";
import {
  creativeConceptHumanPlacePatienceFailures,
  creativeSceneHumanPlacePatienceFailures,
} from "../lib/creative/quality/runtime/CreativeHumanPlacePatienceTruthRuntime.js";

function groundedPlan() {
  return {
    temporal_contract: { human_place_patience_required: true },
    concept: {
      task_truth: {
        real_problem: "Operational fragmentation steals attention from people doing real work across places and systems.",
        human_tension: "People remain responsible for outcomes while administrative friction competes with the work itself.",
        brand_reason_to_exist: "The system earns a role by absorbing coordination friction without replacing human judgment.",
        evidence_refs: ["brief:operational-fragmentation"],
      },
      human_truth: {
        lived_behavior_or_ritual: "A worker checks a handwritten instruction, adjusts the physical task, then continues without acknowledging camera.",
        emotional_contradiction: "Competence and pressure coexist; the person knows the craft while the surrounding process remains fragile.",
        why_it_matters: "The audience recognizes responsibility and adaptation rather than an actor demonstrating an industry category.",
        evidence_refs: ["research:work-observation"],
      },      place_truth: {
        why_here_not_anywhere: "Weather, distance, architecture and local operating conditions change how the work is physically performed.",
        environmental_pressures: ["wind alters loose materials", "distance delays coordination"],
        cultural_or_working_details: ["paper handoffs remain visible", "tools and spaces shape how people coordinate"],
        evidence_refs: ["research:place-observation"],
      },
      patience_strategy: {
        what_to_withhold: "Do not explain the system before the audience has felt the human friction it exists to solve.",
        what_to_let_breathe: "Allow a real work action and its consequence to complete before moving to the next image.",
        exit_trigger: "Cut when a gesture, sound or completed action changes what the audience understands.",
        anti_stasis_rule: "Performance, sound, weather, depth, focus or composition must evolve during every held moment.",
      },
    },
  };
}

function groundedScene() {
  return { human_place_patience: {
    human_observation: {
      required: true,
      observed_behavior: "The worker folds the used note, places it beside the tool and resumes without looking toward camera.",
      micro_detail: "A thumb smooths the damp paper edge before it is tucked away.",      relationship_or_consequence: "The note carries another person's decision and changes the next physical action.",
      non_performance_rule: "No smiling to camera, posed teamwork, presentation gesture or generic typing shorthand.",
    },
    place_observation: {
      required: true,
      sensory_fact: "Wind pushes loose material against the work surface while moisture beads on exposed metal.",
      behavioral_effect: "The worker braces the paper and changes body position before continuing the task.",
      material_or_weather_effect: "Moisture darkens fabric and leaves uneven reflective patches on metal.",
      sound_fact: "Wind masks distant voices while paper, clothing and machinery occupy distinct acoustic distances.",
    },
    patience_design: {
      required: true,
      held_question: "Will the handoff survive the physical conditions and reach the next action correctly?",
      internal_change: "The note deforms, is secured, read and then causes a change to the tool setting.",
      cut_trigger: "The tool engages after the adjustment, completing the causal action and earning the cut.",
      visual_evolution: "Wind, hand position, paper shape, focus and machine state evolve while the camera remains restrained.",
    },
  } };
}

test("evidence-backed human/place/patience truth passes", () => {
  assert.deepEqual(creativeConceptHumanPlacePatienceFailures(groundedPlan()), []);
  assert.deepEqual(creativeSceneHumanPlacePatienceFailures(groundedScene()), []);
});
test("generic soul/place/patience language fails closed", () => {
  const conceptFailures = creativeConceptHumanPlacePatienceFailures({
    temporal_contract: { human_place_patience_required: true },
    concept: {
      task_truth: { real_problem: "cinematic", human_tension: "emotional", brand_reason_to_exist: "premium", evidence_refs: [] },
      human_truth: { lived_behavior_or_ritual: "authentic", emotional_contradiction: "human", why_it_matters: "beautiful", evidence_refs: [] },
      place_truth: { why_here_not_anywhere: "atmospheric", environmental_pressures: [], cultural_or_working_details: [], evidence_refs: [] },
      patience_strategy: { what_to_withhold: "cinematic", what_to_let_breathe: "emotional", exit_trigger: "beautiful", anti_stasis_rule: "premium" },
    },
  });
  assert.ok(conceptFailures.includes("CONCEPT_REAL_TASK_PROBLEM_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_HUMAN_EVIDENCE_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_PLACE_SPECIFICITY_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_PATIENCE_EXIT_TRIGGER_REQUIRED"));
});

test("patient scene without internal evolution fails", () => {
  const scene = groundedScene();
  scene.human_place_patience.patience_design.internal_change = "cinematic";
  assert.ok(creativeSceneHumanPlacePatienceFailures(scene).includes("SCENE_PATIENCE_INTERNAL_CHANGE_REQUIRED"));
});